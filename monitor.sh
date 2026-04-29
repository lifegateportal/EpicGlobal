#!/bin/bash

# Define your Discord or Slack Webhook URL here
WEBHOOK_URL="https://your.webhook.url/here"

# Calculate current memory usage percentage
MEMORY_USAGE=$(free | awk '/Mem/{printf("%d"), $3/$2*100}')

# Issue a soft warning if memory exceeds 85%, but allow processes to continue
if [ "$MEMORY_USAGE" -ge 85 ]; then
    MESSAGE="⚠️ Soft Warning: Server memory utilization is at ${MEMORY_USAGE}%. Consider optimizing build configurations."
    
    curl -H "Content-Type: application/json" \
         -d "{\"content\": \"$MESSAGE\"}" \
         $WEBHOOK_URL
fi