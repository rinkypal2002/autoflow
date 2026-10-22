
# Use Tomcat 11 with Java 21
FROM tomcat:11.0-jdk21-temurin

# Remove default applications
RUN rm -rf /usr/local/tomcat/webapps/*

# Deploy the AutoFlow Engine WAR
COPY engine.war /usr/local/tomcat/webapps/engine.war

# Tomcat listens on port 8080
EXPOSE 8080

# Start Tomcat
CMD ["catalina.sh", "run"]
