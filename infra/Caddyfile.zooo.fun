{
	servers {
		protocols h1 h2
	}
}

www.zooo.fun {
	redir https://zooo.fun{uri} permanent
}

zooo.fun {
	handle /landing/*.mp4 {
		root * /opt/zoofun-web/public
		file_server
		header Cache-Control "public, max-age=604800"
		header Content-Type video/mp4
		header Accept-Ranges bytes
		header -Vary
	}

	handle /staff* {
		reverse_proxy 127.0.0.1:8000
	}

	handle /v1/* {
		reverse_proxy 127.0.0.1:8000
	}

	handle /health {
		reverse_proxy 127.0.0.1:8000
	}

	redir /admin /staff

	handle_path /api/zoo/* {
		reverse_proxy 127.0.0.1:8000
	}

	handle /island* {
		reverse_proxy 127.0.0.1:8081
	}

	handle {
		encode gzip zstd
		reverse_proxy 127.0.0.1:3000
	}
}

crm.zooo.fun {
	handle /v1/* {
		reverse_proxy 127.0.0.1:8000
	}

	handle {
		encode gzip zstd
		root * /opt/zoofun-crm/dist
		try_files {path} /index.html
		file_server
	}
}
