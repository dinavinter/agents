"""
Mock implementation of the SAP Agent Gateway SDK.
Will be replaced by the real SDK package once available.

Usage:
    from gatewaySDK import MCP
    url = MCP.get_url("sap.s4:apiResource:API_SUPPLIERINVOICE_PROCESS_SRV:v1")
    # Use the returned URL with any MCP-capable HTTP client,
    # e.g. langchain-mcp-adapters MultiServerMCPClient.

Behind the scenes, the real SDK will inspect the environment and translate
the requested MCP server and tenant ID into a URL to the agent gateway.
Authentication is handled transparently (certificate, token in URL, or similar).
"""
import urllib.parse


class MCP:
    _GATEWAY_BASE = "https://agent-gateway.cfapps.eu12.hana.ondemand.com/mcp"

    @staticmethod
    def get_url(ord_id: str) -> str:
        """
        Translate an ORD ID into an Agent Gateway MCP endpoint URL.

        Args:
            ord_id: The ORD ID of the API resource, e.g.
                    "sap.s4:apiResource:API_SUPPLIERINVOICE_PROCESS_SRV:v1"

        Returns:
            A fully-qualified HTTPS URL that can be used as an MCP server
            endpoint. Authentication is handled transparently by the gateway.
        """
        encoded = urllib.parse.quote(ord_id, safe="")
        return f"{MCP._GATEWAY_BASE}/{encoded}"
