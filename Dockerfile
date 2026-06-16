FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose server port
EXPOSE 8000

# Set production environment variables
ENV PORT=8000
ENV NODE_ENV=production

# Run the Fastify server
CMD ["npm", "start"]
