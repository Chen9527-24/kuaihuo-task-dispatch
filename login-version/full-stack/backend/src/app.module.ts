import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { storageConfig } from './config/storage.config';
import { validateEnv } from './config/validate-env';
import { AuthModule } from './modules/auth/auth.module';
import { AiModule } from './modules/ai/ai.module';
import { AppUsersModule } from './modules/app-users/app-users.module';
import { DailyTasksModule } from './modules/daily-tasks/daily-tasks.module';
import { DictsModule } from './modules/dicts/dicts.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { MediaAccountsModule } from './modules/media-accounts/media-accounts.module';
import { OperationLogsModule } from './modules/operation-logs/operation-logs.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RolesModule } from './modules/roles/roles.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { WechatModule } from './modules/wechat/wechat.module';
import { WithdrawalsModule } from './modules/withdrawals/withdrawals.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      load: [appConfig, authConfig, storageConfig],
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    AiModule,
    AuthModule,
    AppUsersModule,
    UsersModule,
    FilesModule,
    HealthModule,
    RbacModule,
    DictsModule,
    TenantsModule,
    PermissionsModule,
    RolesModule,
    MediaAccountsModule,
    DailyTasksModule,
    WechatModule,
    WithdrawalsModule,
    OperationLogsModule,
  ],
})
export class AppModule {}
