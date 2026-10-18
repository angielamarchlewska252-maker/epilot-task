#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ArenaStack } from "../lib/arena-stack.js";

const app = new cdk.App();

new ArenaStack(app, "BtcPredictionArena", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "eu-central-1",
  },
  description: "BTC Prediction Arena API, player table, and settlement worker.",
});
