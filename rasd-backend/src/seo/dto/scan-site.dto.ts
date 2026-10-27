import { IsUrl, IsNotEmpty } from 'class-validator';

export class ScanSiteDto {
  @IsNotEmpty()
  @IsUrl({ require_protocol: true })
  url: string;
}