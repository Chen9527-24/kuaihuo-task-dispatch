import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @Length(3, 32)
  username!: string;

  @ApiProperty({ example: 'YOUR_ADMIN_PASSWORD' })
  @IsString()
  @Length(6, 100)
  password!: string;
}
