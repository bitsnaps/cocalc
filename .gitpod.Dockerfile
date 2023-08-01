FROM gitpod/workspace-postgres

USER gitpod

# Update packages
RUN sudo apt-get update -y
RUN sudo apt-get install pandoc -y
RUN sudo apt-get install texlive-xetex texlive-fonts-recommended texlive-plain-generic -y

# Install LaTeX
RUN sudo apt-get -q update && \
    sudo apt-get install -yq texlive && \
    sudo rm -rf /var/lib/apt/lists/*