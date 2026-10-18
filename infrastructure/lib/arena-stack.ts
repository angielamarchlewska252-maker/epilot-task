import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export class ArenaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const allowedOrigin =
      (this.node.tryGetContext("allowedOrigin") as string | undefined) ??
      process.env.ALLOWED_ORIGIN ??
      "http://localhost:5173";

    const players = new dynamodb.Table(this, "Players", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
    });

    players.addGlobalSecondaryIndex({
      indexName: "DueGuesses",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    const code = lambda.Code.fromAsset(path.join(dirname, "../../apps/api/dist"));
    const environment = {
      TABLE_NAME: players.tableName,
      PRICE_PROVIDER: "coingecko",
      COINGECKO_PRICE_URL:
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true&precision=2",
      QUOTE_MAX_AGE_MS: "120000",
      ALLOWED_ORIGIN: allowedOrigin,
      NODE_ENV: "production",
    };

    const apiLogGroup = new logs.LogGroup(this, "ApiLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const apiFunction = new lambda.Function(this, "ApiFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "lambda.handler",
      code,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment,
      logGroup: apiLogGroup,
    });
    players.grant(apiFunction, "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query");

    const workerLogGroup = new logs.LogGroup(this, "WorkerLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const workerFunction = new lambda.Function(this, "SettlementWorker", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "worker.handler",
      code,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment,
      logGroup: workerLogGroup,
    });
    players.grant(workerFunction, "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query");

    new events.Rule(this, "SettleEveryMinute", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new targets.LambdaFunction(workerFunction)],
    });

    const httpApi = new apigwv2.HttpApi(this, "HttpApi");
    httpApi.addRoutes({
      path: "/api/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: new HttpLambdaIntegration("ApiIntegration", apiFunction),
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "TableName", { value: players.tableName });
  }
}
