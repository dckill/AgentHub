#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { parseAllDocuments } = require('yaml');

const registryToken = '__AGENTHUB_REGISTRY_PREFIX__';
const identityToken = '__AGENTHUB_CERTIFICATE_IDENTITY__';
const issuerToken = '__AGENTHUB_CERTIFICATE_ISSUER__';

function validateSignedImagePolicyOptions(options) {
    const errors = [];
    const registryPrefix = options?.registryPrefix ?? '';
    const certificateIdentity = options?.certificateIdentity ?? '';
    const certificateIssuer = options?.certificateIssuer ?? '';
    const registryPattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?(?:\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)+$/;

    if (!registryPattern.test(registryPrefix)
        || registryPrefix.includes('/../')
        || registryPrefix.includes('/./')) {
        errors.push('registryPrefix must be a lowercase registry path without a scheme, traversal or trailing slash');
    }

    let issuer;
    try {
        issuer = new URL(certificateIssuer);
        if (issuer.protocol !== 'https:'
            || issuer.username
            || issuer.password
            || issuer.search
            || issuer.hash
            || certificateIssuer.endsWith('/')
            || issuer.pathname !== '/') {
            errors.push('certificateIssuer must be an HTTPS origin without credentials, path, query or fragment');
        }
    } catch {
        errors.push('certificateIssuer must be a valid HTTPS origin');
    }

    try {
        const identity = new URL(certificateIdentity);
        if (identity.protocol !== 'https:'
            || identity.username
            || identity.password
            || identity.search
            || identity.hash
            || !identity.pathname.endsWith('//.gitlab-ci.yml@refs/heads/master')
            || /[\^$*]/.test(certificateIdentity)
            || (issuer && identity.origin !== issuer.origin)) {
            errors.push('certificateIdentity must be the exact protected GitLab master pipeline subject on the issuer origin');
        }
    } catch {
        errors.push('certificateIdentity must be a valid protected GitLab master pipeline URL');
    }

    return errors;
}

function renderSignedImagePolicy(template, options) {
    const errors = validateSignedImagePolicyOptions(options);
    if (errors.length > 0) throw new Error(`Invalid signed image policy options: ${errors.join('; ')}`);

    for (const token of [registryToken, identityToken, issuerToken]) {
        if (!template.includes(token)) throw new Error(`Signed image policy template is missing ${token}`);
    }

    const rendered = template
        .replaceAll(registryToken, options.registryPrefix)
        .replaceAll(identityToken, options.certificateIdentity)
        .replaceAll(issuerToken, options.certificateIssuer);
    if (/__[A-Z0-9_]+__/.test(rendered)) throw new Error('Signed image policy contains an unresolved placeholder');

    const documents = parseAllDocuments(rendered).map((document) => document.toJSON());
    if (documents.length !== 3
        || documents.some((policy) => policy?.apiVersion !== 'policy.sigstore.dev/v1alpha1'
            || policy?.kind !== 'ClusterImagePolicy'
            || policy?.spec?.mode !== 'enforce'
            || policy?.spec?.authorities?.length !== 1
            || policy.spec.authorities[0]?.signatureFormat !== 'bundle'
            || policy.spec.authorities[0]?.attestations?.length !== 1
            || policy.spec.authorities[0].attestations[0]?.predicateType !== 'https://sigstore.dev/cosign/sign/v1')) {
        throw new Error('Signed image policy must contain exactly three enforce-mode ClusterImagePolicy resources');
    }
    return rendered;
}

function atomicWrite(outputPath, content) {
    const absolute = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
    const staging = `${absolute}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(staging, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        fs.renameSync(staging, absolute);
        fs.chmodSync(absolute, 0o600);
    } finally {
        try { fs.unlinkSync(staging); } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }
    }
}

function parseArguments(argv) {
    const values = {};
    for (let index = 0; index < argv.length; index += 1) {
        const current = argv[index];
        if (!current.startsWith('--')) throw new Error(`Unexpected argument: ${current}`);
        const name = current.slice(2);
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
        values[name] = value;
        index += 1;
    }
    return values;
}

if (require.main === module) {
    try {
        const values = parseArguments(process.argv.slice(2));
        for (const required of ['registry-prefix', 'certificate-identity', 'certificate-issuer', 'output']) {
            if (!values[required]) throw new Error(`Missing required --${required}`);
        }
        const templatePath = path.resolve(
            __dirname,
            '../packages/agenthub-server/deploy/policies/require-signed-agenthub-images.yaml',
        );
        const rendered = renderSignedImagePolicy(fs.readFileSync(templatePath, 'utf8'), {
            registryPrefix: values['registry-prefix'],
            certificateIdentity: values['certificate-identity'],
            certificateIssuer: values['certificate-issuer'],
        });
        atomicWrite(values.output, rendered);
        process.stdout.write(`${path.resolve(values.output)}\n`);
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    atomicWrite,
    renderSignedImagePolicy,
    validateSignedImagePolicyOptions,
};
