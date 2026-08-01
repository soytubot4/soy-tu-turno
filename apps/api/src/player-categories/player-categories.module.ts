import { Module } from '@nestjs/common';
import { PlayerCategoriesController } from './player-categories.controller';
import { PlayerCategoriesService } from './player-categories.service';

@Module({
  controllers: [PlayerCategoriesController],
  providers: [PlayerCategoriesService],
  exports: [PlayerCategoriesService],
})
export class PlayerCategoriesModule {}
