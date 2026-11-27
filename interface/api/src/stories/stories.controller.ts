import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SignedInGuard } from '../auth/signed-in.guard.js';
import { ProjectGuard } from '../projects/project.guard.js';
import { AgentService } from '../agent/agent.service.js';
import { StoriesService } from './stories.service.js';
import { AdoptionService } from '../projects/adoption.service.js';

@Controller('projects/:repository/stories')
@UseGuards(SignedInGuard, ProjectGuard)
export class StoriesController {
  constructor(
    private readonly stories: StoriesService,
    private readonly agent: AgentService,
    private readonly adoption: AdoptionService,
  ) {}

  @Get()
  list(@Req() req: Request, @Param('repository') repository: string) {
    return this.stories.list(req.session.token!, repository);
  }

  /** Assignable developers (declared before “:number”). */
  @Get('developers')
  developers(@Req() req: Request, @Param('repository') repository: string) {
    return this.stories.developers(req.session.token!, repository);
  }

  @Get(':number')
  detail(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number) {
    return this.stories.detail(req.session.token!, repository, number);
  }

  /** Assigns (or, with `null`, removes) the developer of a blocked request. */
  @Post(':number/assign')
  assign(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number, @Body('login') login: unknown) {
    return this.stories.assign(req.session.token!, repository, number, login === undefined ? null : login);
  }

  /** Approved breakdown: ADA publishes the ticked stories, as the PO reviewed them. */
  @Post(':number/breakdown')
  createBreakdown(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number, @Body('stories') stories: unknown) {
    return this.stories.createBreakdown(req.session.token!, repository, number, stories, req.session.user!.login);
  }

  /** Wild mode: the prompt is saved as an issue and launched; the assistant proposes a plan. */
  @Post('prompt')
  async submitPrompt(@Req() req: Request, @Param('repository') repository: string, @Body('text') text: unknown) {
    await this.agent.checkLaunchable(req.session.token!, repository);
    await this.adoption.checkAdoptionFinished(req.session.token!, repository);
    const workRequest = await this.stories.submitPrompt(req.session.token!, repository, text, req.session.user!.login);
    await this.agent.analyze(req.session.token!, repository, workRequest.number, req.session.user!.login);
    return workRequest;
  }

  /** Conversation (“real prompt”): the first message becomes an issue; ADA answers by acting. */
  @Post('conversation')
  async openConversation(@Req() req: Request, @Param('repository') repository: string, @Body('text') text: unknown) {
    await this.agent.checkLaunchable(req.session.token!, repository);
    await this.adoption.checkAdoptionFinished(req.session.token!, repository);
    const login = req.session.user!.login;
    const conversation = await this.stories.openConversation(req.session.token!, repository, text, login);
    await this.agent.converse(req.session.token!, login, repository, conversation.number);
    return conversation;
  }

  /** Launches the request, then the assistant starts its analysis (questions or plan). */
  @Post(':number/launch')
  async launch(@Req() req: Request, @Param('repository') repository: string, @Param('number', ParseIntPipe) number: number, @Body('fingerprint') fingerprint: unknown) {
    await this.agent.checkLaunchable(req.session.token!, repository);
    await this.adoption.checkAdoptionFinished(req.session.token!, repository);
    const launched = await this.stories.launch(req.session.token!, repository, number, req.session.user!.login, fingerprint);
    await this.agent.analyze(req.session.token!, repository, number, req.session.user!.login);
    return launched;
  }

}
