#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
bash crm/scripts/reset-test-db.sh
npm run crm:build
SITE_ENV=production npm run build
npm test
node --test crm/tests/vercel.test.js
CRM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/heartara_test node --test crm/tests/validation.test.js crm/tests/database.test.js
CRM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/heartara_test node --test crm/tests/email-confirmation.test.js
CRM_TEST_API=1 node --test crm/tests/api.test.js

CRM_TEST_API=1 node --test crm/tests/client-email.test.js
