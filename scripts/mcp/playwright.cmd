@echo off
REM Launch the pinned Playwright MCP server for ZCode's workspace tooling.
REM Pinned deliberately: an unpinned `latest` changes tool schemas without review.
REM Documented in docs/infra/mcp-setup.md.
npx -y @playwright/mcp@0.0.85 --headless --browser chrome --isolated %*
