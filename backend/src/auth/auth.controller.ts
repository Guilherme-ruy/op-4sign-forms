import { Controller, Post, Get, Body, Param, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Get('me')
  me(@Request() req: any) {
    return this.authService.getMe(req.user.sub);
  }

  @Public()
  @Throttle({ default: { ttl: 3600000, limit: 5 } })
  @Post('forgot-password')
  forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Public()
  @Get('validate-token/:token')
  validateToken(@Param('token') token: string) {
    return this.authService.validateToken(token);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Public()
  @Post('accept-invite')
  acceptInvite(@Body() body: { token: string; name: string; password: string }) {
    return this.authService.acceptInvite(body.token, body.name, body.password);
  }
}
