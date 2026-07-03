#!/usr/bin/env python3
"""Test AI Core connectivity and list available deployments"""
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv('app/.env.local')

print("=" * 60)
print("AI Core Configuration Test")
print("=" * 60)

# Check required environment variables
required_vars = [
    'AICORE_BASE_URL',
    'AICORE_CLIENT_ID',
    'AICORE_CLIENT_SECRET',
    'AICORE_AUTH_URL',
    'AICORE_RESOURCE_GROUP'
]

print("\n1. Checking environment variables:")
print("-" * 60)
missing_vars = []
for var in required_vars:
    value = os.environ.get(var)
    if value:
        if 'SECRET' in var or 'TOKEN' in var:
            print(f"✓ {var}: {value[:20]}...")
        else:
            print(f"✓ {var}: {value}")
    else:
        print(f"✗ {var}: NOT SET")
        missing_vars.append(var)

if missing_vars:
    print(f"\n❌ Missing required variables: {', '.join(missing_vars)}")
    sys.exit(1)

print("\n2. Testing AI Core authentication:")
print("-" * 60)

try:
    import requests
    from requests.auth import HTTPBasicAuth
    
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
    
    if token_response.status_code == 200:
        print("✓ Successfully authenticated with AI Core")
        token = token_response.json()['access_token']
    else:
        print(f"✗ Authentication failed: {token_response.status_code}")
        print(f"  Response: {token_response.text}")
        sys.exit(1)
        
except Exception as e:
    print(f"✗ Authentication error: {e}")
    sys.exit(1)

print("\n3. Listing AI Core deployments:")
print("-" * 60)

try:
    base_url = os.environ['AICORE_BASE_URL']
    resource_group = os.environ['AICORE_RESOURCE_GROUP']
    
    # List deployments
    deployments_url = f"{base_url}/v2/lm/deployments"
    headers = {
        'Authorization': f'Bearer {token}',
        'AI-Resource-Group': resource_group
    }
    
    deployments_response = requests.get(deployments_url, headers=headers, timeout=10)
    
    if deployments_response.status_code == 200:
        deployments = deployments_response.json()
        
        if 'resources' in deployments and deployments['resources']:
            print(f"✓ Found {len(deployments['resources'])} deployment(s):\n")
            
            for deployment in deployments['resources']:
                deployment_id = deployment.get('id', 'N/A')
                scenario_id = deployment.get('scenarioId', 'N/A')
                status = deployment.get('status', 'N/A')
                model_name = deployment.get('details', {}).get('resources', {}).get('backend_details', {}).get('model', {}).get('name', 'N/A')
                
                print(f"  Deployment ID: {deployment_id}")
                print(f"  Scenario ID: {scenario_id}")
                print(f"  Model: {model_name}")
                print(f"  Status: {status}")
                print()
                
            # Check for Claude model
            claude_deployments = [d for d in deployments['resources'] 
                                if 'claude' in str(d.get('details', {}).get('resources', {}).get('backend_details', {}).get('model', {}).get('name', '')).lower()]
            
            if claude_deployments:
                print(f"✓ Found {len(claude_deployments)} Claude deployment(s)")
            else:
                print("⚠ No Claude deployments found")
                print("  You may need to deploy the model first in AI Core")
        else:
            print("⚠ No deployments found in this resource group")
            print(f"  Resource Group: {resource_group}")
            print("  You may need to:")
            print("  1. Deploy a model in AI Core")
            print("  2. Check if the resource group is correct")
    else:
        print(f"✗ Failed to list deployments: {deployments_response.status_code}")
        print(f"  Response: {deployments_response.text}")
        if deployments_response.status_code == 403:
            print("\n  💡 This usually means:")
            print("     - The resource group doesn't exist or you don't have access")
            print("     - Try checking available resource groups with list_resource_groups.py")
        
except Exception as e:
    print(f"✗ Error listing deployments: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("Test complete")
print("=" * 60)