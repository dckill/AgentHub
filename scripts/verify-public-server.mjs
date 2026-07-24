#!/usr/bin/env node
import { io } from 'socket.io-client';

const rawUrl = process.env.SERVER_URL || process.env.AGENTHUB_SERVER_URL || process.argv[2] || '';
const serverUrl = rawUrl.replace(/\/+$/, '');

if (!serverUrl) {
    console.error('用法: SERVER_URL=https://agenthub.yzsd.asia:8443 node scripts/verify-public-server.mjs');
    console.error('或: node scripts/verify-public-server.mjs https://agenthub.yzsd.asia:8443');
    process.exit(2);
}

async function checkHttp(path, expectedStatus, expectedBodyPart) {
    const url = `${serverUrl}${path}`;
    const response = await fetch(url, {
        headers: {
            'X-AgentHub-Client': 'public-deploy-probe',
        },
    });
    const body = await response.text();

    if (response.status !== expectedStatus) {
        throw new Error(`${url} 返回 ${response.status}，期望 ${expectedStatus}。响应: ${body.slice(0, 200)}`);
    }

    if (expectedBodyPart && !body.includes(expectedBodyPart)) {
        throw new Error(`${url} 响应内容不包含 ${JSON.stringify(expectedBodyPart)}。响应: ${body.slice(0, 200)}`);
    }

    console.log(`HTTP PASS ${path} -> ${response.status}`);
}

async function checkSocketIo() {
    await new Promise((resolve, reject) => {
        const socket = io(serverUrl, {
            path: '/v1/updates',
            transports: ['websocket'],
            reconnection: false,
            timeout: 10000,
            auth: {
                token: 'public-deploy-probe-invalid-token',
                clientType: 'user-scoped',
                agenthubClient: 'public-deploy-probe',
            },
        });

        const timer = setTimeout(() => {
            socket.close();
            reject(new Error('Socket.IO websocket 连接超时；请检查 OnePanel/Nginx 是否启用 WebSocket upgrade，且 /v1/updates 没有被其他规则拦截。'));
        }, 12000);

        socket.on('connect', () => {
            clearTimeout(timer);
            socket.close();
            reject(new Error('Socket.IO 意外连接成功；验证脚本使用的是无效 token，正常应由服务端返回认证错误。'));
        });

        socket.on('connect_error', (error) => {
            clearTimeout(timer);
            socket.close();
            const message = error?.message || '';
            if (message.includes('Invalid authentication token') || message.includes('Missing authentication token')) {
                console.log(`Socket.IO PASS /v1/updates -> ${message}`);
                resolve();
                return;
            }
            reject(new Error(`Socket.IO 连接到达失败或被代理中断: ${message || 'unknown error'}`));
        });
    });
}

try {
    await checkHttp('/', 200, 'Welcome to AgentHub Server!');
    await checkHttp('/v1/account/profile', 401);
    await checkSocketIo();
    console.log(`PUBLIC SERVER PASS ${serverUrl}`);
} catch (error) {
    console.error(`PUBLIC SERVER FAIL ${serverUrl}`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
