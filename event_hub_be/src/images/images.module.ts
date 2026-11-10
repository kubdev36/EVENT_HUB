import { Module } from '@nestjs/common';
import { ImageStorage, LocalDiskImageStorage } from './image-storage.js';
import { ImagesController } from './images.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [ImagesController],
  providers: [
    { provide: ImageStorage, useFactory: () => new LocalDiskImageStorage() },
  ],
  exports: [ImageStorage],
})
export class ImagesModule {}
