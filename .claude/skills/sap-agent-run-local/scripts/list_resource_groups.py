#!/usr/bin/env python3
"""List all available resource groups in AI Core"""
import os
import sys
from dotenv import load_dotenv
import requests
from requests.auth import HTTPBasicAuth

# Load environment variables
load_dotenv('app/.env.local')

print("=" * 60)
print("AI Core Resource Groups")
print("=" * 60)

try:
    # Get OAuth token
    auth_url = os.environ['AICORE_AUTH_URL']
    client_id = os.environ['AICORE_CLIENT_ID']
    client_secret = os.environ['AICORE_CLIENT_SECRET']
    
    token_response = requests.post(
        f"{auth_url}/oauth/token",
        auth=HTTPBasicAuth(client_id, client_secret),
        data={'grant_type': 'client_credentials'},
        timeout=10
    )
    
    if token_response.status_code != 200:
        print(f"✗ Authentication failed: {token_response.status_code}")
        sys.exit(1)
        
    token = token_response.json()['access_token']
    print("✓ Successfully authenticated\n")
    
    # List resource groups
    base_url = os.environ['AICORE_BASE_URL']
    
    # Try different endpoints (with and without /v2)
    endpoints = [
        f"{base_url}/v2/admin/resourceGroups",
        f"{base_url}/v2/lm/resourceGroups",
        f"{base_url}/v2/resourceGroups",
        f"{base_url}/admin/resourceGroups",
        f"{base_url}/lm/resourceGroups",
        f"{base_url}/resourceGroups",
    ]
    
    found = False
    for endpoint in endpoints:
        print(f"Trying: {endpoint}")
        response = requests.get(
            endpoint,
            headers={'Authorization': f'Bearer {token}'},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Success! Response:")
            print(f"  {data}\n")
            
            if 'resources' in data:
                print(f"Found {len(data['resources'])} resource group(s):")
                for rg in data['resources']:
                    print(f"  - {rg.get('resourceGroupId', rg)}")
            found = True
            break
        else:
            print(f"  Status: {response.status_code}")
            if response.status_code != 404:
                print(f"  Response: {response.text[:200]}")
        print()
    
    if not found:
        print("⚠ Could not find resource groups endpoint")
        print("\nThis might mean:")
        print("  1. Your credentials don't have admin access")
        print("  2. The AI Core instance uses a different API structure")
        print("\nTry contacting your AI Core administrator to:")
        print("  - Verify the correct resource group name")
        print("  - Confirm you have access to the resource group")
    
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()

print("=" * 60)