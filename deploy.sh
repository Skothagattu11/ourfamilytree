#!/usr/bin/env bash
# Deploy the Family Tree app + voice assistant to Cloud Run.
# Usage: ./deploy.sh            (uses the defaults below)
set -euo pipefail

PROJECT="${PROJECT:-entropy-lifestyle}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-family-tree}"
SA_NAME="family-tree-run"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
SUPABASE_URL="https://abcmxkmdxljynqayadic.supabase.co"
SUPABASE_KEY="sb_publishable_iZc_tbkcRb6MklT4WTBthQ_cQ1U9asG"

# A dedicated runtime identity that may only call Vertex AI.
if ! gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" --display-name "Family Tree (Cloud Run)"
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/aiplatform.user --condition=None >/dev/null
fi

gcloud run deploy "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --source . \
  --service-account "$SA" \
  --allow-unauthenticated \
  --timeout 3600 \
  --session-affinity \
  --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 3 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},VERTEX_LIVE_MODEL=gemini-3.8-live,VOICE_NAME=Aoede,SUPABASE_URL=${SUPABASE_URL},SUPABASE_KEY=${SUPABASE_KEY}"
