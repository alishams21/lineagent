import os
from dotenv import load_dotenv

load_dotenv(override=True)


sql_mcp_server_params = [
    {"command": "python", "args": ["algorithm/plugins/sql_lineage_agent/mcp_servers/mcp_sql_lineage/lineage_aql_server.py"]},
]
