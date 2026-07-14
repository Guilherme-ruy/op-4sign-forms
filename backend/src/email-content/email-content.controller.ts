import { Controller, Get, Put, Post, Delete, Body, Request } from '@nestjs/common';
import { EmailContentService, type UpdateEmailContentDto, type PreviewEmailContentDto } from './email-content.service';
import { Roles } from '../auth/roles.decorator';

@Controller('email-content')
@Roles('SUPER_ADMIN')
export class EmailContentController {
  constructor(private readonly content: EmailContentService) {}

  @Get()
  get() {
    return this.content.getMasked();
  }

  @Put()
  update(@Body() body: UpdateEmailContentDto, @Request() req: any) {
    return this.content.update(body, req?.user?.sub);
  }

  @Delete()
  reset(@Request() req: any) {
    return this.content.reset(req?.user?.sub);
  }

  @Post('preview')
  preview(@Body() body: PreviewEmailContentDto) {
    return this.content.preview(body);
  }
}
