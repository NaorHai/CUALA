#!/bin/bash

# CUALA Backend Startup Script
# This script starts the backend server and Redis (if configured)
# Usage: ./start-backend.sh [--prod]
#   --prod: Start in production mode (no hot-reload)

set -e

# Check for production mode
PROD_MODE=false
if [ "$1" = "--prod" ] || [ "$1" = "-p" ]; then
    PROD_MODE=true
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

echo -e "${GREEN}🚀 Starting CUALA Backend...${NC}"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  Warning: .env file not found at $ENV_FILE${NC}"
    echo -e "${YELLOW}   Using default configuration (memory storage)${NC}"
    STORAGE_TYPE="memory"
else
    # Read STORAGE_TYPE from .env file
    # Remove comments and whitespace, then extract value
    STORAGE_TYPE=$(grep -E "^STORAGE_TYPE=" "$ENV_FILE" | cut -d '=' -f2 | tr -d ' ' | tr -d "'" | tr -d '"' || echo "memory")
    # Convert to lowercase
    STORAGE_TYPE=$(echo "$STORAGE_TYPE" | tr '[:upper:]' '[:lower:]')
    
    # Default to memory if empty
    if [ -z "$STORAGE_TYPE" ]; then
        STORAGE_TYPE="memory"
    fi
fi

echo -e "${GREEN}📦 Storage Type: ${STORAGE_TYPE}${NC}"

# If Redis is needed, ensure it's up
if [ "$STORAGE_TYPE" = "redis" ]; then
    echo -e "${GREEN}🔴 Checking Redis...${NC}"
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Error: Docker is not installed or not in PATH${NC}"
        echo -e "${RED}   Redis is required but Docker is not available${NC}"
        exit 1
    fi
    
    # Use docker-compose if available, otherwise use docker compose
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        COMPOSE_CMD="docker compose"
    fi
    
    # Function to check if Redis is responding
    check_redis_health() {
        if docker exec cuala-redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
            return 0
        else
            return 1
        fi
    }
    
    # Check if Redis container exists and is running
    REDIS_RUNNING=false
    if docker ps --format '{{.Names}}' | grep -q "^cuala-redis$"; then
        # Container is running, check if Redis is responding
        if check_redis_health; then
            echo -e "${GREEN}✅ Redis is up and responding${NC}"
            REDIS_RUNNING=true
        else
            echo -e "${YELLOW}⚠️  Redis container exists but not responding, attempting to restart...${NC}"
            cd "$PROJECT_ROOT"
            $COMPOSE_CMD restart redis || $COMPOSE_CMD up -d redis
        fi
    elif docker ps -a --format '{{.Names}}' | grep -q "^cuala-redis$"; then
        # Container exists but is stopped
        echo -e "${YELLOW}⚠️  Redis container exists but is stopped, starting it...${NC}"
        cd "$PROJECT_ROOT"
        if ! $COMPOSE_CMD start redis 2>/dev/null; then
            echo -e "${YELLOW}   Start failed, trying up -d...${NC}"
            $COMPOSE_CMD up -d redis
        fi
    else
        # Container doesn't exist, create and start it
        echo -e "${GREEN}   Redis container not found, creating and starting...${NC}"
        cd "$PROJECT_ROOT"
        $COMPOSE_CMD up -d redis
    fi
    
    # Wait for Redis to be healthy (if not already running)
    if [ "$REDIS_RUNNING" = false ]; then
        echo -e "${GREEN}   Waiting for Redis to be ready...${NC}"
        MAX_RETRIES=30
        RETRY_COUNT=0
        
        while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
            if check_redis_health; then
                echo -e "${GREEN}✅ Redis is ready!${NC}"
                REDIS_RUNNING=true
                break
            fi
            RETRY_COUNT=$((RETRY_COUNT + 1))
            sleep 1
        done
        
        if [ "$REDIS_RUNNING" = false ]; then
            echo -e "${RED}❌ Error: Redis failed to start or become ready after ${MAX_RETRIES} seconds${NC}"
            echo -e "${RED}   Please check Docker and Redis logs: docker logs cuala-redis${NC}"
            exit 1
        fi
    fi
    
    # Final verification that Redis is accessible
    if ! check_redis_health; then
        echo -e "${RED}❌ Error: Redis is not responding after startup${NC}"
        echo -e "${RED}   Please check Docker and Redis logs: docker logs cuala-redis${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}💾 Using in-memory storage (Redis not needed)${NC}"
fi

# Change to server directory
cd "$SCRIPT_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules not found. Installing dependencies...${NC}"
    npm install
fi

# Start the backend server
echo -e "${GREEN}🚀 Starting backend server...${NC}"
echo -e "${GREEN}   Server will be available at http://localhost:3001${NC}"
echo -e "${GREEN}   Press Ctrl+C to stop${NC}"
echo ""

# Trap Ctrl+C to cleanup
trap 'echo -e "\n${YELLOW}🛑 Stopping backend server...${NC}"; exit 0' INT TERM

# Start the server
if [ "$PROD_MODE" = true ]; then
    echo -e "${GREEN}   Running in production mode${NC}"
    npm run start-api
else
    echo -e "${GREEN}   Running in development mode (hot-reload enabled)${NC}"
    npm run dev
fi

