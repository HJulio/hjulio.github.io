---
title: "[EN] Sonarr + Radarr + Prwolarr + Jellyfin + Tailscale Guide"
description: "A guide to set up Sonarr, Radarr, Prowlarr, Jellyfin, and Tailscale."
date: "Nov 28 2024"
---

## Introduction

> The fight against piracy seemed won with the rise of streaming, but big corporations weren’t satisfied with winning. Video streaming has turned into a fragmented and overpriced chaos, with countless services, skyrocketing prices, and catalogs that lack continuity.

---

In this guide, we’ll set up your own **arr** application suite (Sonarr, Radarr), which automates finding and managing multimedia files through torrent indexers.  

The trackers/indexers are centrally managed with *Prowlarr*. Files will then be cataloged and served using *Jellyfin*, a powerful open-source media server.

As a bonus, we’ll add *Jellyseerr* to simplify file requests and optionally configure a *Samba* server to share raw files over the network.

Rather than exposing anything directly to the internet, we’ll create a private virtual network with Tailscale to securely and encryptedly access our services from anywhere.

![Network Diagram](/static/guia-arr/diagram.png)

---

## Requirements

This guide assumes you’re setting everything up on Linux, but it should be similar for Windows and Mac.

You’ll need to install:

- Docker + Docker Compose. [+info](https://docs.docker.com/engine/install/)
- Tailscale. [+info](https://tailscale.com/kb/1347/installation/)

---

## docker-compose.yaml

```docker
services:
  transmission:
    image: linuxserver/transmission
    container_name: transmission
    restart: unless-stopped
    ports:
      - "9091:9091"
      - "51413:51413"
      - "51413:51413/udp"
    environment:
      # - TRANSMISSION_WEB_HOME=/config/transmissionic 
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Madrid

    volumes:
      - /path_to_downloads/downloads:/downloads
      - /path_to_settings/transmission/config:/config
      - /path_to_settings/transmission/watch:/watch

  radarr:
    image: linuxserver/radarr:latest
    container_name: radarr
    restart: always
    ports:
      - "7878:7878"
    environment:
      - PGID=1000
      - PUID=1000
      - TZ=Europe/Madrid
    volumes:
      - /path_to_settings/radarr:/config
      - /path_to_downloads/movies:/movies
      - /path_to_downloads/downloads:/downloads

  sonarr:
    image: linuxserver/sonarr:latest
    container_name: sonarr
    restart: always
    ports:
      - "8989:8989"
    environment:
      - PGID=1000
      - PUID=1000
      - TZ=Europe/Madrid
    volumes:
      - /path_to_settings/sonarr:/config
      - /path_to_downloads/tv:/tv
      - /path_to_downloads/downloads:/downloads

  prowlarr:
    image: linuxserver/prowlarr:develop
    container_name: prowlarr
    restart: always
    ports:
      - "9696:9696"
    cap_add:
      - NET_ADMIN
    environment:
      - PGID=1000
      - PUID=1000
      - TZ=Europe/Madrid
    volumes:
      - /path_to_settings/prowlarr:/config
      - /path_to_settings/transmission/watch:/downloads # transmission watch directory

  flaresolverr:
    image: ghcr.io/flaresolverr/flaresolverr:latest
    container_name: flaresolverr
    environment:
      - LOG_LEVEL=warning
      - LOG_HTML=false
      - TZ=Europe/Madrid
    ports:
      - "8191:8191"
    restart: unless-stopped

  jellyfin:
    image: lscr.io/linuxserver/jellyfin:latest
    container_name: jellyfin
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Madrid
      - JELLYFIN_PublishedServerUrl=http://192.x.x.x #optional
      - # DOCKER_MODS=linuxserver/mods:jellyfin-opencl-intel # for intel gpu video acceleration
    volumes:
      - /path_to_settings/jellyfin:/config
      - /path_to_downloads/tv:/data/tvshows
      - /path_to_downloads/movies:/data/movies
    #group_add:
      #- "109" #for intel gpu video acceleration
    #devices:
      #- /dev/dri:/dev/dri # for video acceleration
    ports:
      - 8096:8096
      - 8920:8920 #optional
      - 7359:7359/udp #optional
      - 1900:1900/udp #optional
    restart: unless-stopped

  jellyseerr:
    image: fallenbagel/jellyseerr:latest
    container_name: jellyseerr
    environment:
      - LOG_LEVEL=warning
      - TZ=Europe/Madrid
      - PORT=5055 #optional
      - PUID=1000
      - PGID=1000
    ports:
      - 5055:5055
    volumes:
      - /path_to_settings/jellyseerr:/app/config
    restart: unless-stopped

   samba:
     image: dperson/samba:latest
     container_name: samba
     restart: always
     deploy:
       resources:
         limits:
           memory: 512M
     ports:
       - "139:139"
       - "445:445"
     environment:
       - USERID=1000
       - GROUPID=1000
       - SHARE=Media;/media
       - TZ=Europe/Madrid
     volumes:
       - /path_to_downloads:/media
```

---

## Variables
This section breaks down the configuration variables used in each service in the `docker-compose.yaml` file.

### Common Variables

**`PUID` and `PGID`**  
Define the operating system user and group IDs under which containers will run. This ensures containers have appropriate permissions to read and write on mounted volumes without running as `root`.

Find your PUID and PGID with:

```bash
id $(whoami)
```

**`TZ`**  
Sets the container’s time zone.  
Example: `Europe/Madrid`.

**`volumes`**  
Maps local directories to the containers.  
Syntax: `local_directory:container_directory`.

---

### Service: **Transmission**

Transmission is a BitTorrent client with a web interface for managing downloads.

- `TRANSMISSION_WEB_HOME`  
  Path to a custom Transmission web interface. I use [Transmissionic](https://github.com/6c65726f79/Transmissionic). 
  Place the files in `/config/transmissionic` and uncomment the line.

- **`ports`**
  - `9091`: Port for accessing the web interface.  
  - `51413` (TCP/UDP): Port used for torrent connections.

I’ve set up Transmission without a VPN, but you can easily add one. There are Docker images that include everything you need, like this [VPN Transmission](https://github.com/haugene/docker-transmission-openvpn). Be sure to adjust the `volumes` and `environment` variables accordingly.

---

### Service: **Radarr**

Radarr is a movie manager that automates movie downloads and organization.

- **`ports`**
  - `7878`: Port for accessing the web interface.

- **`volumes`**
  - `/config`: Folder where Radarr stores its configuration.  
  - `/movies`: Destination folder for organized movies.  
  - `/downloads`: Folder for downloads made by Transmission.

---


### Service: **Sonarr**

Sonarr is a series manager that automates series downloads and organization, similar to Radarr. It also automatically manages new episodes.

- **`ports`**
  - `8989`: Port for accessing the web interface.

- **`volumes`**

  - `/config`: Folder where Sonarr stores its configuration.  
  - `/tv`: Destination folder for organized series.  
  - `/downloads`: Folder for downloads made by Transmission.    

---

### Service: **Prowlarr**

Prowlarr is an indexer manager that centralizes torrent searches and communication with *arr services. You can also add Usenet indexers, but we won’t go there.

- **`ports`**
  - `9696`: Port for accessing the web interface.

- **`cap_add`**

  - Adds extra privileges to control the network (`NET_ADMIN`).  
  - Necessary if you configure a proxy or VPN inside the container.

- **`volumes`**

  - `/config`: Folder where Prowlarr stores its configuration.  
  - `/downloads`: Mounts Transmission’s watch directory.

---

### Service: **Flaresolverr**

Flaresolverr is a captcha resolution service (especially for Cloudflare) that allows you to use some public indexers behind Cloudflare.

- **`LOG_LEVEL`**
  Log level detail. Can be `info`, `warning`, `error`, etc.

- **`LOG_HTML`**
  Enables or disables logging of HTML responses.  
  - Recommended value: `false`. 

- **`ports`**
  - `8191`: Proxy port for resolving Cloudflare and other challenges.

---

### Service: **Jellyfin**

Jellyfin is a media server. You can access your movies, series, music, and photos from anywhere. It’s a free alternative to Plex.

Jellyfin catalogs, retrieves metadata, and covers...

It can also transcode on-the-fly to match the client’s connection speed or the video format supported by the device. This feature is called

Transcoding can be very demanding on the server, so you need a powerful hardware or a compatible GPU. If you have one, you can enable hardware acceleration. This requires some modifications to the container, which are indicated in the `DOCKER_MODS` variable. You can find more information on the [linuxserver page](https://docs.linuxserver.io/images/docker-jellyfin/#hardware-acceleration-enhancements).

- **`JELLYFIN_PublishedServerUrl`** *(optional)*:  
  Public URL shown in Jellyfin’s client apps.  
  - Example: `http://192.168.x.x`.

- **`DOCKER_MODS`** *(optional)*:
  List of container modifications (like specific hardware support).

- **`volumes`**
  - `/config`: Jellyfin’s configuration.  
  - `/data/tvshows`: Folder where Jellyfin will look for series.  
  - `/data/movies`: Folder where Jellyfin will look for movies.

- **`group_add`** and **`devices`**
    - Configuration to enable hardware acceleration.

---

### Service: **Jellyseerr**

Jellyseerr is a web server that simplifies requesting new files from Sonarr and Radarr, with a simple web interface and a catalog of new releases.

- **`LOG_LEVEL`**
  Log level detail.

- **`PORT`**

  Port to access Jellyseerr’s interface.

- **`volumes`**
  - `/app/config`: Folder for Jellyseerr’s configuration.

---

### Service: **Samba**

Samba is a file server that allows you to share files over the network with other devices.

- **`USERID` and `GROUPID`**
  User and group with permissions over the shared files.

- **`SHARE`**

  Defines the shared resources.  
  - Format: `ResourceName;Path`.  
  - Example: `Media;/media`.

- **`volumes`**

  - `/media`: Local folder exposed to the network.

Samba tends to be problematic with everything (permissions, configuration, authentication...). This image simplifies the process, but for any issues, consult the [official documentation](https://hub.docker.com/r/dperson/samba).

---


## Tailscale

Tailscale is a WireGuard-based private virtual network (VPN) service that securely connects your devices. It’s free for personal use.

Steps to configure Tailscale:

1. Create an account and network on the [Tailscale website](https://login.tailscale.com/admin).  
2. Install Tailscale on all devices you want to connect.  
3. Add your devices to the network.  

You’ll be able to access your server’s services securely from anywhere in the world using their Tailscale-assigned IP (usually `100.x.x.x`).

---

## Initial Configuration: Prowlarr, Jellyfin, and Jellyseerr

Access each service’s web interface in your browser. The address will be `http://localhost:port` or `http://100.x.x.x:port` if you’re using Tailscale.

### Prowlarr Setup

Prowlarr centralizes torrent indexers for Sonarr and Radarr. Follow these steps:

1. **Access the Prowlarr interface**:  
   ```
   http://localhost:9696
   ```

2. **Add indexers**:  
   Go to **Indexers** > **Add Indexer**, select an indexer, and configure the required fields (e.g., API Key).  

3. **Connect Sonarr and Radarr**:  
   In **Settings** > **Apps**, add Sonarr and Radarr with their API Keys and internal URLs (`http://sonarr:8989` and `http://radarr:7878`).

---

### Jellyfin Setup

Jellyfin is your media server. Configure it as follows:

1. **Access the Jellyfin interface**:  
   ```
   http://localhost:8096
   ```

2. **Create an admin account**.  

3. **Set up libraries**:  
   Add your media folders (e.g., `/data/movies` for movies and `/data/tvshows` for series).

4. **Optional**: Configure transcoding settings to match your hardware and streaming needs.

---

### Jellyseerr Setup

Jellyseerr simplifies requesting new content from Sonarr and Radarr.

1. **Access Jellyseerr**:  
   ```
   http://localhost:5055
   ```

2. **Connect to Jellyfin**:  
   Add Jellyfin’s URL (`http://jellyfin:8096`) and credentials/API Key in **Settings** > **Jellyfin**.

3. **Connect to Sonarr and Radarr**:  
   Add their respective URLs and API Keys under **Settings**.

---

## Usage

Once everything is set up, you can primarily use Jellyseerr to request new movies or series and Jellyfin to enjoy your content.

---

## Final Notes

- **Security**:  
  
Do not expose your services directly to the internet. Use Tailscale for encrypted access.  

- **Transcoding**:  
  
Adjust Jellyfin’s transcoding settings for optimal performance.  

- **Clients**:  
  
Access Jellyfin via web browsers or its official apps on Android, iOS, Roku, etc. Some browsers may not support advanced codecs (4K, HDR, etc.).  

- **Troubleshooting**:  
  
If any service isn’t working as expected, check the container logs (`docker logs container_name`) or the official documentation.

- **Updates**:

Keep your containers and Docker images up to date with `docker-compose pull` and `docker-compose up -d`.

- **Portainer**:

If you prefer a graphical interface, add Portainer to your `docker-compose.yaml` and access it at `http://localhost:9000`.

- **More Information and Advanced Guides**:

Explore the configuration of each service with the TRaSH community’s guides [TRaSH Guides](https://trash-guides.info/).

