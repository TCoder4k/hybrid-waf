FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time, not
# read at container start — must arrive as a build ARG (see docker-compose.yml
# frontend.build.args), not a runtime `environment:` entry, or the value
# never reaches the compiled output.
ARG NEXT_PUBLIC_ADMIN_API_URL
ENV NEXT_PUBLIC_ADMIN_API_URL=$NEXT_PUBLIC_ADMIN_API_URL

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
