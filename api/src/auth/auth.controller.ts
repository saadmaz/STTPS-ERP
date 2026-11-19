import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsString, Length, MaxLength } from "class-validator";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { RegisterDto } from "./dto/register.dto.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Public } from "../common/decorators/public.decorator.js";

export class MfaVerifyDto {
  @IsString() @MaxLength(2000) mfaToken!: string;
  @IsString() @Length(6, 20) code!: string;
}

export class MfaCodeDto {
  @IsString() @Length(6, 20) code!: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(200) currentPassword!: string;
  @IsString() @Length(10, 200) newPassword!: string;
}

const COOKIE = "refresh_token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/api/v1/auth",
};

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  private finish(res: Response, result: { accessToken: string; refreshToken: string; user: unknown }) {
    res.cookie(COOKIE, result.refreshToken, COOKIE_OPTIONS);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post("register")
  @ApiOperation({ summary: "Register a new organization" })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sign in; answers { mfaRequired, mfaToken } when two-step sign-in is on" })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto, req.ip, req.headers["user-agent"]);
    if ("mfaRequired" in result) return result;
    return this.finish(res, result);
  }

  @Public()
  @Post("mfa/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Second sign-in step: an authenticator code or a recovery code" })
  async verifyMfa(@Body() dto: MfaVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.finish(res, await this.authService.completeMfa(dto.mfaToken, dto.code, req.ip, req.headers["user-agent"]));
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refresh access token" })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[COOKIE];
    if (!refreshToken) throw new UnauthorizedException("No refresh token");
    const tokens = await this.authService.refreshTokens(refreshToken);
    res.cookie(COOKIE, tokens.refreshToken, COOKIE_OPTIONS);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Logout" })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[COOKIE];
    if (refreshToken) await this.authService.logout(refreshToken);
    res.clearCookie(COOKIE, { path: COOKIE_OPTIONS.path });
    return { message: "Logged out" };
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user profile" })
  async getProfile(@CurrentUser("id") userId: string) {
    return this.authService.getProfile(userId);
  }

  @Get("sessions")
  @ApiBearerAuth()
  @ApiOperation({ summary: "My signed-in devices" })
  sessions(@CurrentUser("id") userId: string, @Req() req: Request) {
    return this.authService.listSessions(userId, req.cookies?.[COOKIE]);
  }

  @Delete("sessions/:id")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Sign out one device" })
  revoke(@CurrentUser("id") userId: string, @Param("id") id: string) {
    if (!/^[0-9a-f]{16}$/.test(id)) throw new UnauthorizedException("Invalid session id");
    return this.authService.revokeSessions(userId, { id });
  }

  @Post("sessions/revoke-others")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Sign out every other device" })
  revokeOthers(@CurrentUser("id") userId: string, @Req() req: Request) {
    return this.authService.revokeSessions(userId, { allExcept: req.cookies?.[COOKIE] ?? null });
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change my password; signs out other devices" })
  changePassword(@CurrentUser("id") userId: string, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword, req.cookies?.[COOKIE]);
  }

  @Post("mfa/setup")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Start two-step sign-in: returns a secret and otpauth URL to scan" })
  mfaSetup(@CurrentUser("id") userId: string) {
    return this.authService.mfaSetup(userId);
  }

  @Post("mfa/enable")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Confirm with a code; returns one-time recovery codes" })
  mfaEnable(@CurrentUser("id") userId: string, @Body() dto: MfaCodeDto) {
    return this.authService.mfaEnable(userId, dto.code);
  }

  @Post("mfa/disable")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Turn two-step sign-in off (needs a current code or recovery code)" })
  mfaDisable(@CurrentUser("id") userId: string, @Body() dto: MfaCodeDto) {
    return this.authService.mfaDisable(userId, dto.code);
  }
}
