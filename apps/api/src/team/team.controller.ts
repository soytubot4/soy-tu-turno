import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import {
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateRolesConfigSchema,
  type InviteMemberInput,
  type UpdateMemberRoleInput,
  type UpdateRolesConfigInput,
} from '@soytuturno/shared';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { TeamService } from './team.service';

@Controller('team')
export class TeamController {
  constructor(private readonly service: TeamService) {}

  @Get('members')
  async list() {
    return { ok: true, data: await this.service.list() };
  }

  @Get('roles')
  async roles() {
    return { ok: true, data: await this.service.getRolesConfig() };
  }

  @Put('roles')
  async saveRoles(
    @Body(new ZodValidationPipe(updateRolesConfigSchema)) body: UpdateRolesConfigInput,
  ) {
    return { ok: true, data: await this.service.saveRolesConfig(body) };
  }

  @Post('invite')
  async invite(@Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMemberInput) {
    return { ok: true, data: await this.service.invite(body) };
  }

  @Patch('members/:id/role')
  async updateRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) body: UpdateMemberRoleInput,
  ) {
    return { ok: true, data: await this.service.updateRole(id, body) };
  }

  @Delete('members/:id')
  async remove(@Param('id') id: string) {
    return { ok: true, data: await this.service.remove(id) };
  }
}
