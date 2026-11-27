import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { ProjectGuard } from '../projects/project.guard.js';
import { AgentService } from './agent.service.js';

@Controller('projects/:repository/stories/:number')
@UseGuards(SignedInGuard, ProjectGuard)
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Get('activity')
  activity(@Param('repository') repository: string, @Param('number', ParseIntPipe) number: number) {
    return this.agent.activity(repository, number);
  }

  /** Estimated carbon footprint of this request (every run of the agent). */
  @Get('footprint')
  footprint(@Param('repository') repository: string, @Param('number', ParseIntPipe) number: number) {
    return this.agent.workRequestFootprint(repository, number);
  }

  @Post('plan/approve')
  async validate(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number) {
    await this.agent.approvePlan(req.session.token!, req.session.user!.login, repository, number);
    return { ok: true };
  }

  @Post('relaunch')
  async relaunch(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number) {
    await this.agent.relaunch(req.session.token!, req.session.user!.login, repository, number);
    return { ok: true };
  }

  /** Conversation: a new message from the PO; ADA answers by acting. */
  @Post('conversation/message')
  async message(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number, @Body('text') text: unknown) {
    await this.agent.resumeConversation(req.session.token!, req.session.user!.login, repository, number, text);
    return { ok: true };
  }

  /** “All good”: the changes of the conversation become a PR (or nothing, if there are none). */
  @Post('conversation/finish')
  finish(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number) {
    return this.agent.finishConversation(req.session.token!, req.session.user!.login, repository, number);
  }

  /** Stop the conversation: nothing is added to the project. */
  @Post('conversation/stop')
  async stop(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number) {
    await this.agent.stopConversation(req.session.token!, req.session.user!.login, repository, number);
    return { ok: true };
  }

  /** Answer to the questions, or request to change the plan: the assistant resumes its analysis. */
  @Post('response')
  async reply(
    @Req() req: Request,
    @Param('repository') repository: string,
    @Param('number', ParseIntPipe) number: number,
    @Body('text') text: string,
  ) {
    await this.agent.resumeAnalysis(req.session.token!, repository, number, text);
    return { ok: true };
  }
}
