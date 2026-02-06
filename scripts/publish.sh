#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== dbooly Extension Publisher ===${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Run this script from the project root.${NC}"
    exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "Current version: ${YELLOW}${CURRENT_VERSION}${NC}"

# Parse arguments
VERSION_BUMP=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --patch)
            VERSION_BUMP="patch"
            shift
            ;;
        --minor)
            VERSION_BUMP="minor"
            shift
            ;;
        --major)
            VERSION_BUMP="major"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./scripts/publish.sh [options]"
            echo ""
            echo "Options:"
            echo "  --patch     Bump patch version (0.0.x)"
            echo "  --minor     Bump minor version (0.x.0)"
            echo "  --major     Bump major version (x.0.0)"
            echo "  --dry-run   Package only, don't publish"
            echo "  -h, --help  Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./scripts/publish.sh --patch          # Publish with patch bump"
            echo "  ./scripts/publish.sh --dry-run        # Package without publishing"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Run linting
echo -e "\n${GREEN}Running linter...${NC}"
npm run lint || {
    echo -e "${RED}Linting failed. Fix errors before publishing.${NC}"
    exit 1
}

# Build the extension
echo -e "\n${GREEN}Building extension...${NC}"
npm run build

# Package or publish
if [ "$DRY_RUN" = true ]; then
    echo -e "\n${GREEN}Packaging extension (dry run)...${NC}"
    npx vsce package
    VSIX_FILE=$(ls -t *.vsix | head -1)
    echo -e "\n${GREEN}Created: ${VSIX_FILE}${NC}"
    echo -e "To install locally: ${YELLOW}code --install-extension ${VSIX_FILE}${NC}"
else
    # Check if logged in to vsce
    if ! npx vsce verify-pat shakram02 2>/dev/null; then
        echo -e "${YELLOW}Not logged in to VS Code Marketplace${NC}"
        echo -e "Run: ${YELLOW}npx vsce login shakram02${NC}"
        echo -e "You'll need a Personal Access Token from Azure DevOps"
        exit 1
    fi

    echo -e "\n${GREEN}Publishing to VS Code Marketplace...${NC}"
    if [ -n "$VERSION_BUMP" ]; then
        npx vsce publish $VERSION_BUMP
        NEW_VERSION=$(node -p "require('./package.json').version")
        echo -e "\n${GREEN}Published version ${NEW_VERSION}${NC}"

        # Commit version bump
        git add package.json package-lock.json
        git commit -m "chore: bump version to ${NEW_VERSION}"
        git tag "v${NEW_VERSION}"
        echo -e "${YELLOW}Don't forget to push: git push && git push --tags${NC}"
    else
        npx vsce publish
        echo -e "\n${GREEN}Published version ${CURRENT_VERSION}${NC}"
    fi
fi

echo -e "\n${GREEN}Done!${NC}"
