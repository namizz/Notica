import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { TwoFactorLoginDto } from './dto/two-factor-login.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private async getTokens(userId: string, email: string) {
    const jwtPayload = {
      sub: userId,
      email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: process.env.JWT_SECRET || 'super-secret-dev',
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(
        { sub: userId },
        {
          secret: process.env.JWT_REFRESH_SECRET || 'super-secret-dev-refresh',
          expiresIn: '7d',
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async updateRefreshTokenHash(userId: string, refreshToken: string | null) {
    let hash: string | null = null;
    if (refreshToken) {
      hash = await bcrypt.hash(refreshToken, 10);
    }
    await this.prisma.dashboardUser.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.dashboardUser.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // Run in a transaction to guarantee atomicity (Tenant, User, Project)
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
        },
      });

      // 2. Create Dashboard User (OWNER)
      const user = await tx.dashboardUser.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          role: Role.OWNER,
        },
      });

      // 3. Generate secure API key
      const randomKey = crypto.randomBytes(24).toString('hex');
      const apiKey = `ntc_live_${randomKey}`;

      // 4. Create default project
      const project = await tx.project.create({
        data: {
          tenantId: tenant.id,
          name: 'Default Project',
          apiKey,
        },
      });

      return { user, tenant, project };
    });

    // Generate tokens
    const tokens = await this.getTokens(result.user.id, result.user.email);
    await this.updateRefreshTokenHash(result.user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        tenantId: result.user.tenantId,
      },
      project: {
        id: result.project.id,
        name: result.project.name,
        apiKey: result.project.apiKey,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.dashboardUser.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // If 2FA is enabled, do not return JWT tokens yet. Require MFA step.
    if (user.isTwoFactorEnabled) {
      return {
        mfaRequired: true,
        email: user.email,
      };
    }

    // Generate tokens
    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async generateTwoFactorSecret(userId: string) {
    const user = await this.prisma.dashboardUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(user.email, 'Notica', secret);
    const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUrl);

    // Save secret to database temporarily (unverified)
    await this.prisma.dashboardUser.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });

    return {
      secret,
      qrCodeDataUrl,
    };
  }

  async turnOnTwoFactor(userId: string, code: string) {
    const user = await this.prisma.dashboardUser.findUnique({
      where: { id: userId },
    });

    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication has not been initialized');
    }

    const isCodeValid = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    });

    if (!isCodeValid) {
      throw new UnauthorizedException('Invalid 2FA verification code');
    }

    await this.prisma.dashboardUser.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: true },
    });

    return { message: 'Two-factor authentication enabled successfully' };
  }

  async authenticateTwoFactor(dto: TwoFactorLoginDto) {
    const user = await this.prisma.dashboardUser.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('Access Denied');
    }

    const isCodeValid = authenticator.verify({
      token: dto.code,
      secret: user.twoFactorSecret,
    });

    if (!isCodeValid) {
      throw new UnauthorizedException('Invalid 2FA verification code');
    }

    // Code is valid, issue final tokens
    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async validateOAuthUser(profile: { email: string; provider: string; providerId: string; name?: string }) {
    let user = await this.prisma.dashboardUser.findUnique({
      where: { email: profile.email },
    });

    if (user) {
      // If user exists but is not linked to this provider, link it
      if (user.authProvider !== profile.provider) {
        user = await this.prisma.dashboardUser.update({
          where: { id: user.id },
          data: {
            authProvider: profile.provider,
            authProviderId: profile.providerId,
          },
        });
      }
    } else {
      // New signup via OAuth
      const result = await this.prisma.$transaction(async (tx) => {
        // Create new tenant
        const companyName = profile.name ? `${profile.name}'s Organization` : `${profile.email.split('@')[0]}'s Organization`;
        const tenant = await tx.tenant.create({
          data: { name: companyName },
        });

        // Create user
        const newUser = await tx.dashboardUser.create({
          data: {
            tenantId: tenant.id,
            email: profile.email,
            passwordHash: null,
            authProvider: profile.provider,
            authProviderId: profile.providerId,
            role: Role.OWNER,
          },
        });

        // Generate default project
        const randomKey = crypto.randomBytes(24).toString('hex');
        const apiKey = `ntc_live_${randomKey}`;

        const project = await tx.project.create({
          data: {
            tenantId: tenant.id,
            name: 'Default Project',
            apiKey,
          },
        });

        return { user: newUser, tenant, project };
      });

      user = result.user;
    }

    // Generate tokens
    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'super-secret-dev-refresh',
      });
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const userId = payload.sub;
    const user = await this.prisma.dashboardUser.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access Denied');
    }

    const isRefreshTokenValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Access Denied');
    }

    // Generate new tokens (Access + Refresh)
    const tokens = await this.getTokens(user.id, user.email);
    // Store new refresh token hash (rotation)
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async logout(userId: string) {
    await this.updateRefreshTokenHash(userId, null);
    return { message: 'Logged out successfully' };
  }
}
