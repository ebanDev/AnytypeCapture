import grpc from '@grpc/grpc-js';
import * as loader from "@grpc/proto-loader";
import * as util from "node:util";
import prompt from "prompt-sync";
import dotenv from 'dotenv';
import fs from 'fs';
import getPorts from "./getPorts.js";
import { dirname } from 'path';
import { fileURLToPath } from 'url';

console.log('🧠 Hey, let\'s capture your thoughts!');
const content = prompt()('👉 Enter the content: ');

dotenv.config();

const packageDefinition = loader.loadSync(dirname(fileURLToPath(import.meta.url)) + '/protos/service.proto', {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

async function createAuthenticatedClient() {
    const ports = await getPorts();
    const firstPort = ports.response.anytype[0];
    const grpcClient = new protoDescriptor.anytype.ClientCommands(`127.0.0.1:${firstPort}`, grpc.credentials.createInsecure());
    const metadata = new grpc.Metadata();
    const call = (call, input) => util.promisify(call).call(grpcClient, input, metadata);

    if (!process.env.APP_KEY) {
        process.env.APP_KEY = await fetchAppKey(call, grpcClient)
    }

    const APP_KEY = process.env.APP_KEY;
    const sessionToken = await call(grpcClient.WalletCreateSession, { appKey: APP_KEY }).then((res) => res.token);
    metadata.add('token', sessionToken);

    return { call, grpcClient };
}

async function fetchAppKey(call, grpcClient) {
    const newChallenge = await call(grpcClient.AccountLocalLinkNewChallenge, { appName: 'test' });
    console.log('👋 Seems like it is the first time you are using Anytype Capture, please allow this software access to your vault by entering the token below');
    const inputToken = prompt()('🔑 Enter the token: ');
    const solvedChallenge = await call(grpcClient.AccountLocalLinkSolveChallenge, { challengeId: newChallenge.challengeId, answer: inputToken });

    fs.appendFileSync('.env', `APP_KEY=${solvedChallenge.appKey}\n`);
    return solvedChallenge.appKey;
}

async function chooseType(call) {
    const allObjects = await call(grpcClient.ObjectSearchWithMeta, {});
    const availableTypes = allObjects.results.filter((result) => result.details.fields.layout && result.details.fields.layout.numberValue === 4);

    console.log('🏷️ Available types:', availableTypes.map((type, index) => `${index}: ${type.details.fields.name.stringValue}`));
    const chosenType = availableTypes[parseInt(prompt()('🏷️ Choose the type: '))];

    fs.appendFileSync('.env', `TYPE_ID=${chosenType.details.fields.uniqueKey.stringValue}`);
    return chosenType;
}

async function createObjectWithContent(content, call) {

    if (!process.env.TYPE_ID) {
        process.env.TYPE_ID = (await chooseType(call)).details.fields.uniqueKey.stringValue;
    }

    const allObjects = await call(grpcClient.ObjectSearchWithMeta, {});
    const chosenType = allObjects.results.find((result) => result.details.fields.uniqueKey && result.details.fields.uniqueKey.stringValue === process.env.TYPE_ID);

    const object = {
        objectTypeUniqueKey: chosenType.details.fields.uniqueKey.stringValue,

        spaceId: chosenType.details.fields.spaceId.stringValue,
        templateId: chosenType.details.fields.defaultTemplateId.stringValue,
    };

    const createdObject = await call(grpcClient.ObjectCreate, object);

    const newBlock = {
        contextId: createdObject.objectId,
        block: {
            id: "",
            text: { text: content },
        }
    };

    await call(grpcClient.BlockCreate, newBlock);
}

const { call, grpcClient } = await createAuthenticatedClient();

await createObjectWithContent(content, call);
