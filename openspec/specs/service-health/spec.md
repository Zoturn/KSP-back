# service-health Specification

## Purpose

Lets operators, container orchestrators, and developers determine whether the service is
running and able to reach its database, without inspecting logs.

## Requirements

### Requirement: Health endpoint reports liveness

The system SHALL expose a health endpoint reachable over plain HTTP that responds without
requiring authentication.

#### Scenario: Service is up and reachable

- **WHEN** a client sends a request to the health endpoint
- **THEN** the system responds with a success status and a body indicating the service is up

#### Scenario: No authentication required

- **WHEN** a client calls the health endpoint without any credentials
- **THEN** the system does not reject the request for lack of authentication

### Requirement: Health endpoint reports database connectivity

The system SHALL include the status of its PostgreSQL connection in the health response, so a
caller can distinguish "the process is running" from "the process can serve real requests."

#### Scenario: Database is reachable

- **WHEN** the health endpoint is called and the configured PostgreSQL database accepts a
  connection
- **THEN** the response reports the database check as passing

#### Scenario: Database is unreachable

- **WHEN** the health endpoint is called and the configured PostgreSQL database cannot be
  reached (wrong credentials, database down, network unavailable)
- **THEN** the response reports the database check as failing
- **AND** the overall response status reflects that the service is not fully healthy

### Requirement: Health endpoint uses a status code, not a query error channel

The system SHALL communicate health outcomes through the transport's native failure signal
(HTTP status), because health consumers (container probes, load balancers, uptime monitors)
read status codes and cannot parse an application-level error format.

#### Scenario: Fully healthy

- **WHEN** the service is running and the database check passes
- **THEN** the response is a successful HTTP status

#### Scenario: Degraded

- **WHEN** the service is running but the database check fails
- **THEN** the response is an HTTP status indicating failure, not a success status with an
  error payload
