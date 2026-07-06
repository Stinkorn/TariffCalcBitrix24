import { Module } from '@nestjs/common';
import { DictionariesController } from './dictionaries.controller';
import { DictionariesService } from './dictionaries.service';
import { BitrixModule } from '../bitrix/bitrix.module';

@Module({
  imports: [BitrixModule],
  controllers: [DictionariesController],
  providers: [DictionariesService]
})
export class DictionariesModule {}
