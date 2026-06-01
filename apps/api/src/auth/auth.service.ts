import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
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

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
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
