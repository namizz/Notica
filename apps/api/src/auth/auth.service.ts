import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { TwoFactorLoginDto } from './dto/two-factor-login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Role } from '@prisma/client';
import { createApiKeyCredential } from './utils/api-key.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private async createSession(
    userId: string,
    email: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    // 1. Create a session record first to get a unique sessionId
    const session = await this.prisma.userSession.create({
      data: {
        userId,
        refreshTokenHash: '', // Temporary placeholder
        userAgent: userAgent || 'Unknown',
        ipAddress: ipAddress || 'Unknown',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // 2. Generate tokens (Refresh token contains session ID 'sid')
    const jwtPayload = { sub: userId, email, sid: session.id };
    const accessToken = await this.jwtService.signAsync(jwtPayload, {
      secret: process.env.JWT_SECRET || 'super-secret-dev',
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, sid: session.id },
      {
        secret: process.env.JWT_REFRESH_SECRET || 'super-secret-dev-refresh',
        expiresIn: '7d',
      },
    );

    // 3. Hash refresh token and update session record
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async register(dto: RegisterDto, userAgent?: string, ipAddress?: string) {
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

      // 3. Generate the default project's one-time API key.
      const apiKeyCredential = createApiKeyCredential();

      // 4. Store only its hash and non-secret prefix.
      const project = await tx.project.create({
        data: {
          tenantId: tenant.id,
          name: 'Default Project',
          apiKeyHash: apiKeyCredential.hash,
          apiKeyPrefix: apiKeyCredential.prefix,
        },
      });

      return { user, tenant, project, rawApiKey: apiKeyCredential.rawKey };
    });

    // Create session and generate tokens
    const tokens = await this.createSession(
      result.user.id,
      result.user.email,
      userAgent,
      ipAddress,
    );

    return {
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        tenantId: result.user.tenantId,
        isTwoFactorEnabled: result.user.isTwoFactorEnabled,
        authProvider: result.user.authProvider,
      },
      project: {
        id: result.project.id,
        name: result.project.name,
        apiKeyPrefix: result.project.apiKeyPrefix,
        apiKey: result.rawApiKey,
      },
    };
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.dashboardUser.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check Account Lockout
    if (user.lockoutUntil && new Date() < user.lockoutUntil) {
      const minutesLeft = Math.ceil(
        (user.lockoutUntil.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException(
        `Account temporarily locked. Try again in ${minutesLeft} minute(s).`,
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      // Increment failed login attempts
      const attempts = user.failedLoginAttempts + 1;
      if (attempts >= 5) {
        // Lock account for 15 minutes
        await this.prisma.dashboardUser.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockoutUntil: new Date(Date.now() + 15 * 60 * 1000),
          },
        });
        throw new UnauthorizedException(
          'Account locked for 15 minutes due to too many failed attempts.',
        );
      } else {
        await this.prisma.dashboardUser.update({
          where: { id: user.id },
          data: { failedLoginAttempts: attempts },
        });
        throw new UnauthorizedException('Invalid email or password');
      }
    }

    // Reset login attempts on success
    await this.prisma.dashboardUser.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockoutUntil: null },
    });

    // If 2FA is enabled, do not return JWT tokens yet. Require MFA step.
    if (user.isTwoFactorEnabled) {
      return {
        mfaRequired: true,
        email: user.email,
      };
    }

    // Generate tokens under a new session
    const tokens = await this.createSession(
      user.id,
      user.email,
      userAgent,
      ipAddress,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        authProvider: user.authProvider,
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
      throw new BadRequestException(
        'Two-factor authentication has not been initialized',
      );
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

  async authenticateTwoFactor(
    dto: TwoFactorLoginDto,
    userAgent?: string,
    ipAddress?: string,
  ) {
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

    // Code is valid, issue final tokens under a new session
    const tokens = await this.createSession(
      user.id,
      user.email,
      userAgent,
      ipAddress,
    );

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

  async forgotPassword(email: string) {
    const user = await this.prisma.dashboardUser.findUnique({
      where: { email },
    });

    // To prevent email harvesting/enumeration, we always return a success response
    if (!user) {
      return {
        message:
          'If the email exists, a password reset link has been generated.',
      };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await this.prisma.dashboardUser.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: tokenHash,
        resetPasswordExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // Log the link to the console for development testing
    console.log(
      `\n=== PASSWORD RESET LINK ===\nhttp://localhost:3000/reset-password?token=${token}\n===========================\n`,
    );

    return {
      message: 'Reset link generated successfully.',
      token, // Return raw token for development testing
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');

    const user = await this.prisma.dashboardUser.findUnique({
      where: { resetPasswordToken: tokenHash },
    });

    if (
      !user ||
      !user.resetPasswordExpiresAt ||
      new Date() > user.resetPasswordExpiresAt
    ) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    // Reset password, invalidate reset token fields, and terminate all active sessions (security precaution)
    await this.prisma.$transaction([
      this.prisma.dashboardUser.update({
        where: { id: user.id },
        data: {
          passwordHash,
          resetPasswordToken: null,
          resetPasswordExpiresAt: null,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      }),
      this.prisma.userSession.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    return {
      message:
        'Password has been reset successfully. All active sessions logged out.',
    };
  }

  async validateOAuthUser(
    profile: {
      email: string;
      provider: string;
      providerId: string;
      name?: string;
    },
    userAgent?: string,
    ipAddress?: string,
  ) {
    let user = await this.prisma.dashboardUser.findUnique({
      where: { email: profile.email },
    });

    if (user) {
      // Link user if provider mismatch
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
      // New social signup
      const result = await this.prisma.$transaction(async (tx) => {
        const companyName = profile.name
          ? `${profile.name}'s Organization`
          : `${profile.email.split('@')[0]}'s Organization`;
        const tenant = await tx.tenant.create({
          data: { name: companyName },
        });

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

        const apiKeyCredential = createApiKeyCredential();

        await tx.project.create({
          data: {
            tenantId: tenant.id,
            name: 'Default Project',
            apiKeyHash: apiKeyCredential.hash,
            apiKeyPrefix: apiKeyCredential.prefix,
          },
        });

        return { user: newUser };
      });

      user = result.user;
    }

    const tokens = await this.createSession(
      user.id,
      user.email,
      userAgent,
      ipAddress,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        authProvider: user.authProvider,
      },
    };
  }

  async refreshTokens(
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'super-secret-dev-refresh',
      });
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const userId = payload.sub;
    const sessionId = payload.sid;

    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || new Date() > session.expiresAt) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      session.refreshTokenHash,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Access Denied');
    }

    const user = await this.prisma.dashboardUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Rotate tokens on the same session
    const jwtPayload = { sub: user.id, email: user.email, sid: session.id };
    const accessToken = await this.jwtService.signAsync(jwtPayload, {
      secret: process.env.JWT_SECRET || 'super-secret-dev',
      expiresIn: '15m',
    });

    const newRefreshToken = await this.jwtService.signAsync(
      { sub: user.id, sid: session.id },
      {
        secret: process.env.JWT_REFRESH_SECRET || 'super-secret-dev-refresh',
        expiresIn: '7d',
      },
    );

    const newHash = await bcrypt.hash(newRefreshToken, 10);
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newHash,
        userAgent: userAgent || session.userAgent,
        ipAddress: ipAddress || session.ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        authProvider: user.authProvider,
      },
    };
  }

  async logout(sessionId: string) {
    try {
      await this.prisma.userSession.delete({
        where: { id: sessionId },
      });
    } catch (e) {
      // Session already deleted or invalid
    }
    return { message: 'Logged out successfully' };
  }

  async getSessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.prisma.userSession.delete({
      where: { id: sessionId },
    });

    return { message: 'Session revoked successfully' };
  }

  async revokeOtherSessions(userId: string, currentSessionId: string) {
    await this.prisma.userSession.deleteMany({
      where: {
        userId,
        id: { not: currentSessionId },
      },
    });

    return { message: 'All other sessions revoked successfully' };
  }
}
