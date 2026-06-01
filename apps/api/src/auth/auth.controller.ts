import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { TwoFactorLoginDto } from './dto/two-factor-login.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new tenant organization and default project' })
  @ApiResponse({ status: 201, description: 'Tenant registered successfully and default API key generated.' })
  @ApiResponse({ status: 409, description: 'Email already exists.' })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login using dashboard credentials' })
  @ApiResponse({ status: 200, description: 'JWT authentication tokens returned successfully (or MFA required).' })
  @ApiResponse({ status: 401, description: 'Invalid email or password.' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using a valid refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens rotated successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token.' })
  refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate current refresh token' })
  @ApiResponse({ status: 200, description: 'Successfully logged out.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  logout(@Req() req: any) {
    const userId = req.user?.userId;
    return this.authService.logout(userId);
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
  authenticate2Fa(@Body() body: TwoFactorLoginDto) {
    return this.authService.authenticateTwoFactor(body);
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
    return this.authService.validateOAuthUser(req.user);
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
    return this.authService.validateOAuthUser(req.user);
  }
}
