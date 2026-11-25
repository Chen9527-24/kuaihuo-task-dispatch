export class AuthTokensDto {
  accessToken!: string;
  refreshToken!: string;
  accessTokenExpiresIn!: string;
  refreshTokenExpiresIn!: string;
  accessTokenExpiresInSeconds!: number;
  refreshTokenExpiresInSeconds!: number;
  accessTokenExpiresAt!: string;
  refreshTokenExpiresAt!: string;
}
