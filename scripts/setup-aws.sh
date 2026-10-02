#!/usr/bin/env bash
# scripts/setup-aws.sh
# One-time setup: creates ECR repos, GitHub OIDC provider, IAM deployment role, and policies.

set -euo pipefail

AWS_REGION="ap-south-1"
ACCOUNT_ID="406787120842"
INSTANCE_ID="i-02d0a397f1d03ccf6"
ROLE_NAME="GitHubActions-Workforce-Deploy"

echo "=== Setting up AWS Resources for Workforce Access CI/CD ==="
echo "AWS Account: ${ACCOUNT_ID}"
echo "Region:      ${AWS_REGION}"
echo ""

# ── 1. Create ECR Repositories ───────────────────────────────────────────────
echo "1. Ensuring ECR repositories exist..."
aws ecr create-repository --repository-name workforce/backend --region "${AWS_REGION}" 2>/dev/null && echo "   ✓ Created workforce/backend" || echo "   ✓ workforce/backend already exists"
aws ecr create-repository --repository-name workforce/frontend --region "${AWS_REGION}" 2>/dev/null && echo "   ✓ Created workforce/frontend" || echo "   ✓ workforce/frontend already exists"

# ── 2. Create GitHub OIDC Provider ───────────────────────────────────────────
echo ""
echo "2. Ensuring GitHub OIDC Provider exists..."
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 2>/dev/null && echo "   ✓ Created GitHub OIDC Provider" || echo "   ✓ GitHub OIDC Provider already exists"

# ── 3. Create IAM Role for GitHub Actions ─────────────────────────────────────
echo ""
echo "3. Creating IAM Role ${ROLE_NAME}..."

TRUST_POLICY=$(cat << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:Mayur-Dev7/WORKFORCE:*",
            "repo:Mayur-Dev7/workforce:*"
          ]
        }
      }
    }
  ]
}
EOF
)

if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
    echo "   Role ${ROLE_NAME} exists, updating trust policy..."
    aws iam update-assume-role-policy --role-name "${ROLE_NAME}" --policy-document "${TRUST_POLICY}"
    echo "   ✓ Trust policy updated"
else
    aws iam create-role --role-name "${ROLE_NAME}" --assume-role-policy-document "${TRUST_POLICY}"
    echo "   ✓ Role ${ROLE_NAME} created"
fi

# ── 4. Attach Deployment Policy to GitHub Actions Role ────────────────────────
echo ""
echo "4. Attaching WorkforceDeployPolicy..."

DEPLOY_POLICY=$(cat << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ECRPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": [
        "arn:aws:ecr:${AWS_REGION}:${ACCOUNT_ID}:repository/workforce/backend",
        "arn:aws:ecr:${AWS_REGION}:${ACCOUNT_ID}:repository/workforce/frontend"
      ]
    },
    {
      "Sid": "SSMSend",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ssm:${AWS_REGION}::document/AWS-RunShellScript",
        "arn:aws:ec2:${AWS_REGION}:${ACCOUNT_ID}:instance/${INSTANCE_ID}"
      ]
    },
    {
      "Sid": "SSMRead",
      "Effect": "Allow",
      "Action": [
        "ssm:GetCommandInvocation",
        "ssm:ListCommandInvocations",
        "ssm:ListCommands",
        "ssm:DescribeInstanceInformation"
      ],
      "Resource": "*"
    }
  ]
}
EOF
)

aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name WorkforceDeployPolicy \
  --policy-document "${DEPLOY_POLICY}"
echo "   ✓ WorkforceDeployPolicy attached"

# ── 5. Attach ECR Pull Policy to EC2 Role ─────────────────────────────────────
echo ""
echo "5. Attaching ECRPullPolicy to EC2-SessionManager-Role..."

PULL_POLICY=$(cat << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ECRPull",
      "Effect": "Allow",
      "Action": [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:BatchCheckLayerAvailability"
      ],
      "Resource": [
        "arn:aws:ecr:${AWS_REGION}:${ACCOUNT_ID}:repository/workforce/backend",
        "arn:aws:ecr:${AWS_REGION}:${ACCOUNT_ID}:repository/workforce/frontend"
      ]
    }
  ]
}
EOF
)

aws iam put-role-policy \
  --role-name EC2-SessionManager-Role \
  --policy-name ECRPullPolicy \
  --policy-document "${PULL_POLICY}"
echo "   ✓ ECRPullPolicy attached to EC2-SessionManager-Role"

echo ""
echo "=== All AWS Resources Successfully Created & Configured! ==="
echo ""
echo "Your GitHub Actions Secret:"
echo "  Secret Name:  AWS_DEPLOY_ROLE_ARN"
echo "  Secret Value: arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo ""
echo "Now add this secret to: https://github.com/Mayur-Dev7/WORKFORCE/settings/secrets/actions"
echo "Then re-run your GitHub Actions workflow!"
