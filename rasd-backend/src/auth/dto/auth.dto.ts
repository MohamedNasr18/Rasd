import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';

const toTrimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const toEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SignupDto {
  @Transform(toTrimmed)
  @IsString()
  @Length(2, 80)
  name: string;

  @Transform(toEmail)
  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 128)
  password: string;
}

export class VerifyOtpDto {
  @Transform(toEmail)
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

export class ResendOtpDto {
  @Transform(toEmail)
  @IsEmail()
  email: string;
}

export class LoginDto {
  @Transform(toEmail)
  @IsEmail()
  email: string;

  @IsString()
  @Length(1, 128)
  password: string;
}

export class GoogleSignInDto {
  @IsString()
  @MinLength(20)
  idToken: string;
}
