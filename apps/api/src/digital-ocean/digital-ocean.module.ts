import { Module } from '@nestjs/common';
import { DigitalOceanService } from './digital-ocean.service';
import { DomainProvisioningService } from './domain-provisioning.service';

@Module({
  providers: [DigitalOceanService, DomainProvisioningService],
  exports: [DomainProvisioningService],
})
export class DigitalOceanModule {}
