/// <reference path="./.sst/platform/config.d.ts" />

// Deploys the API and the daily refresh job to AWS us-east-2 (Ohio), next to the Neon database.
//   npx sst secret set AnthropicApiKey sk-ant-...   --stage prod
//   npx sst secret set DatabaseUrl postgresql://... --stage prod
//   npx sst secret set AllowedOrigins https://<your-app>.vercel.app,http://localhost:3000 --stage prod
//   npm run deploy

export default $config({
  app(input) {
    return {
      name: 'clearway',
      removal: input?.stage === 'prod' ? 'retain' : 'remove',
      home: 'aws',
      providers: { aws: { region: 'us-east-2' } },
    };
  },
  async run() {
    const anthropicApiKey = new sst.Secret('AnthropicApiKey');
    const databaseUrl = new sst.Secret('DatabaseUrl');
    const allowedOrigins = new sst.Secret('AllowedOrigins', 'http://localhost:3000');

    const api = new sst.aws.Function('Api', {
      handler: 'apps/api/src/lambda.handler',
      runtime: 'nodejs24.x',
      // CORS is handled by the Hono middleware; the URL's own CORS stays off to avoid duplicate headers.
      url: { cors: false },
      streaming: true,
      timeout: '120 seconds',
      memory: '1024 MB',
      environment: {
        ANTHROPIC_API_KEY: anthropicApiKey.value,
        DATABASE_URL: databaseUrl.value,
        ALLOWED_ORIGINS: allowedOrigins.value,
        MODEL_ID: 'claude-sonnet-5-5',
      },
    });

    new sst.aws.CronV2('DailyRefresh', {
      schedule: 'cron(15 6 * * ? *)', // 06:15 UTC every day
      function: {
        handler: 'apps/api/src/jobs/refresh.handler',
        runtime: 'nodejs24.x',
        timeout: '5 minutes',
        memory: '512 MB',
        environment: { DATABASE_URL: databaseUrl.value },
      },
    });

    return { apiUrl: api.url };
  },
});
