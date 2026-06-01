import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req, Get, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { TwoFactorLoginDto } from './dto/two-factor-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Authentication')
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new tenant organization and default project' })
  @ApiResponse({ status: 201, description: 'Tenant registered successfully and default API key generated.' })
  @ApiResponse({ status: 409, description: 'Email already exists.' })
  register(@Body() registerDto: RegisterDto, @Req() req: any) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return this.authService.register(registerDto, userAgent, ipAddress);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login using dashboard credentials' })
  @ApiResponse({ status: 200, description: 'JWT authentication tokens returned successfully (or MFA required).' })
  @ApiResponse({ status: 401, description: 'Invalid email or password / Account locked.' })
  login(@Body() loginDto: LoginDto, @Req() req: any) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return this.authService.login(loginDto, userAgent, ipAddress);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using a valid refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens rotated successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token.' })
  refresh(@Body() refreshTokenDto: RefreshTokenDto, @Req() req: any) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return this.authService.refreshTokens(refreshTokenDto.refreshToken, userAgent, ipAddress);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate current session' })
  @ApiResponse({ status: 200, description: 'Successfully logged out.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  logout(@Req() req: any) {
    const sessionId = req.user?.sid;
    return this.authService.logout(sessionId);
  }

  // --- Two-Factor Authentication Endpoints ---

  @Post('2fa/generate')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate Two-Factor Authentication TOTP secret and QR code data URL' })
  @ApiResponse({ status: 200, description: 'TOTP secret and QR Code Data URI returned successfully.' })
  generate2Fa(@Req() req: any) {
    const userId = req.user?.userId;
    return this.authService.generateTwoFactorSecret(userId);
  }

  @Post('2fa/turn-on')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable Two-Factor Authentication' })
  @ApiResponse({ status: 200, description: '2FA enabled successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid verification code.' })
  turnOn2Fa(@Req() req: any, @Body() body: TwoFactorCodeDto) {
    const userId = req.user?.userId;
    return this.authService.turnOnTwoFactor(userId, body.code);
  }

  @Post('2fa/authenticate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate using a 2FA code' })
  @ApiResponse({ status: 200, description: 'JWT authentication tokens returned successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid 2FA code.' })
  authenticate2Fa(@Body() body: TwoFactorLoginDto, @Req() req: any) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return this.authService.authenticateTwoFactor(body, userAgent, ipAddress);
  }

  // --- Forgot & Reset Password Endpoints ---

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset link' })
  @ApiResponse({ status: 200, description: 'Reset link generated successfully.' })
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using a token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token.' })
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  // --- Session Management Endpoints ---

  @Get('sessions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all active sessions for the user' })
  @ApiResponse({ status: 200, description: 'List of active sessions returned successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  getSessions(@Req() req: any) {
    const userId = req.user?.userId;
    return this.authService.getSessions(userId);
  }

  @Delete('sessions/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific session (Log out remote device)' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully.' })
  @ApiResponse({ status: 404, description: 'Session not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  revokeSession(@Req() req: any, @Param('id') sessionId: string) {
    const userId = req.user?.userId;
    return this.authService.revokeSession(userId, sessionId);
  }

  @Delete('sessions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all other active sessions (Log out all other devices)' })
  @ApiResponse({ status: 200, description: 'All other sessions revoked successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  revokeOtherSessions(@Req() req: any) {
    const userId = req.user?.userId;
    const currentSessionId = req.user?.sid;
    return this.authService.revokeOtherSessions(userId, currentSessionId);
  }

  // --- OAuth2 Authentication Endpoints ---

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth2 login flow' })
  googleAuth(@Req() req: any) {
    // Passport redirects directly to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth2 login callback' })
  @ApiResponse({ status: 200, description: 'Google authenticated successfully. Returns dashboard JWT tokens.' })
  async googleAuthCallback(@Req() req: any) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return this.authService.validateOAuthUser(req.user, userAgent, ipAddress);
  }

  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Initiate GitHub OAuth2 login flow' })
  githubAuth(@Req() req: any) {
    // Passport redirects directly to GitHub
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth2 login callback' })
  @ApiResponse({ status: 200, description: 'GitHub authenticated successfully. Returns dashboard JWT tokens.' })
  async githubAuthCallback(@Req() req: any) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return this.authService.validateOAuthUser(req.user, userAgent, ipAddress);
  }
}
