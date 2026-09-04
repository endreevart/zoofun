FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ENV VITE_BASE=/island/
RUN npx vite build

FROM nginx:1.27-alpine
COPY nginx.pilot.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/island
EXPOSE 80
