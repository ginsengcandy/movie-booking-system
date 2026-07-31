export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Movie Ticket Booking API',
    version: '1.0.0',
    description: 'GC Medi AI-native engineer assignment movie ticket booking API'
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local development server'
    }
  ],
  tags: [
    { name: 'Health', description: 'Service health check' },
    { name: 'Auth', description: 'User registration and login' },
    { name: 'Movies', description: 'Movie, showtime, and seat lookup' },
    { name: 'Bookings', description: 'Authenticated booking operations' }
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Check server health',
        responses: {
          200: {
            description: 'Server is running',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' }
              }
            }
          }
        }
      }
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' }
            }
          }
        },
        responses: {
          201: {
            description: 'User registered',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' }
              }
            }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          409: { $ref: '#/components/responses/Conflict' }
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' }
            }
          }
        },
        responses: {
          200: {
            description: 'Login succeeded',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' }
              }
            }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/movies': {
      get: {
        tags: ['Movies'],
        summary: 'List movies',
        responses: {
          200: {
            description: 'Movie list',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/MovieListResponse'
                }
              }
            }
          }
        }
      }
    },
    '/movies/{movieId}/showtimes': {
      get: {
        tags: ['Movies'],
        summary: 'List showtimes for a movie',
        parameters: [
          {
            name: 'movieId',
            in: 'path',
            required: true,
            schema: { type: 'integer', minimum: 1 }
          }
        ],
        responses: {
          200: {
            description: 'Showtime list',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ShowtimeListResponse'
                }
              }
            }
          },
          404: { $ref: '#/components/responses/NotFound' }
        }
      }
    },
    '/movies/showtimes/{showtimeId}/seats': {
      get: {
        tags: ['Movies'],
        summary: 'List seats for a showtime',
        parameters: [
          {
            name: 'showtimeId',
            in: 'path',
            required: true,
            schema: { type: 'integer', minimum: 1 }
          }
        ],
        responses: {
          200: {
            description: 'Seat list',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SeatListResponse'
                }
              }
            }
          },
          404: { $ref: '#/components/responses/NotFound' }
        }
      }
    },
    '/bookings': {
      post: {
        tags: ['Bookings'],
        summary: 'Create a booking',
        description: 'Creates a CONFIRMED booking. Seat codes are normalized to uppercase before lookup.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateBookingRequest' }
            }
          }
        },
        responses: {
          201: {
            description: 'Booking created',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CreateBookingResponse'
                }
              }
            }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' }
        }
      }
    },
    '/bookings/me': {
      get: {
        tags: ['Bookings'],
        summary: 'List my bookings',
        description: 'Returns only CONFIRMED bookings for the authenticated user. Cancelled booking history is retained in the database but is not exposed by this endpoint.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Authenticated user confirmed booking list',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/BookingListResponse'
                }
              }
            }
          },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/bookings/{bookingId}': {
      delete: {
        tags: ['Bookings'],
        summary: 'Cancel my booking',
        description: 'Marks a CONFIRMED booking as CANCELLED. The booking row is kept for history, cancelled_at is set, updated_at is refreshed, and version is incremented.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'bookingId',
            in: 'path',
            required: true,
            schema: { type: 'integer', minimum: 1 }
          }
        ],
        responses: {
          204: { description: 'Booking cancelled' },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    responses: {
      BadRequest: {
        description: 'Invalid request input',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: {
                code: 'BAD_REQUEST',
                message: 'Invalid request input'
              }
            }
          }
        }
      },
      Unauthorized: {
        description: 'Authentication failed or bearer token is missing',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required'
              }
            }
          }
        }
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: {
                code: 'NOT_FOUND',
                message: 'Resource not found'
              }
            }
          }
        }
      },
      Conflict: {
        description: 'Resource conflict such as duplicate email or booked seat',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: {
                code: 'CONFLICT',
                message: 'Seat is already booked'
              }
            }
          }
        }
      }
    },
    schemas: {
      HealthResponse: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', example: 'ok' }
        }
      },
      MovieListResponse: {
        type: 'object',
        required: ['movies'],
        properties: {
          movies: {
            type: 'array',
            items: { $ref: '#/components/schemas/Movie' }
          }
        }
      },
      ShowtimeListResponse: {
        type: 'object',
        required: ['showtimes'],
        properties: {
          showtimes: {
            type: 'array',
            items: { $ref: '#/components/schemas/Showtime' }
          }
        }
      },
      SeatListResponse: {
        type: 'object',
        required: ['seats'],
        properties: {
          seats: {
            type: 'array',
            items: { $ref: '#/components/schemas/Seat' }
          }
        }
      },
      CreateBookingResponse: {
        type: 'object',
        required: ['booking'],
        properties: {
          booking: { $ref: '#/components/schemas/CreatedBooking' }
        }
      },
      BookingListResponse: {
        type: 'object',
        required: ['bookings'],
        properties: {
          bookings: {
            type: 'array',
            items: { $ref: '#/components/schemas/Booking' }
          }
        }
      },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', minLength: 8, maxLength: 100, example: 'password123' },
          name: { type: 'string', minLength: 1, maxLength: 100, example: 'User' }
        }
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', minLength: 8, maxLength: 100, example: 'password123' }
        }
      },
      AuthResponse: {
        type: 'object',
        required: ['user', 'token'],
        properties: {
          user: { $ref: '#/components/schemas/User' },
          token: {
            type: 'string',
            description: 'JWT bearer token',
            example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
          }
        }
      },
      User: {
        type: 'object',
        required: ['id', 'email'],
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          name: { type: 'string', nullable: true, example: 'User' },
          created_at: { type: 'string', format: 'date-time', example: '2026-08-01T10:00:00.000Z' }
        }
      },
      Movie: {
        type: 'object',
        required: ['id', 'title', 'duration_minutes'],
        properties: {
          id: { type: 'integer', example: 1 },
          title: { type: 'string', example: 'The Matrix' },
          description: { type: 'string', nullable: true, example: 'A sci-fi action movie' },
          duration_minutes: { type: 'integer', example: 136 }
        }
      },
      Showtime: {
        type: 'object',
        required: [
          'id',
          'starts_at',
          'auditorium',
          'duration_minutes',
          'seat_count',
          'booked_seat_count',
          'remaining_seat_count'
        ],
        properties: {
          id: { type: 'integer', example: 1 },
          starts_at: { type: 'string', format: 'date-time', example: '2026-08-01T10:00:00.000Z' },
          auditorium: { type: 'string', example: 'A관' },
          duration_minutes: { type: 'integer', example: 136 },
          seat_count: { type: 'integer', description: 'Total seats for this showtime', example: 8 },
          booked_seat_count: {
            type: 'integer',
            description: 'Number of seats with a CONFIRMED booking',
            example: 3
          },
          remaining_seat_count: {
            type: 'integer',
            description: 'seat_count minus CONFIRMED bookings',
            example: 5
          }
        }
      },
      Seat: {
        type: 'object',
        required: ['code', 'booked'],
        properties: {
          code: { type: 'string', example: 'A1' },
          booked: {
            type: 'boolean',
            description: 'True when the seat has a CONFIRMED booking for this showtime',
            example: false
          }
        }
      },
      CreateBookingRequest: {
        type: 'object',
        required: ['showtimeId', 'seatCode'],
        properties: {
          showtimeId: { type: 'integer', minimum: 1, example: 1 },
          seatCode: { type: 'string', minLength: 2, maxLength: 10, example: 'A1' }
        }
      },
      CreatedBooking: {
        type: 'object',
        required: [
          'id',
          'user_id',
          'showtime_id',
          'seat_id',
          'status',
          'created_at',
          'updated_at',
          'cancelled_at',
          'version'
        ],
        properties: {
          id: { type: 'integer', example: 1 },
          user_id: { type: 'integer', example: 1 },
          showtime_id: { type: 'integer', example: 1 },
          seat_id: { type: 'integer', example: 1 },
          status: { $ref: '#/components/schemas/BookingStatus' },
          created_at: { type: 'string', format: 'date-time', example: '2026-08-01T10:00:00.000Z' },
          updated_at: { type: 'string', format: 'date-time', example: '2026-08-01T10:00:00.000Z' },
          cancelled_at: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            example: null
          },
          version: {
            type: 'integer',
            description: 'Optimistic version value incremented when the booking is cancelled',
            example: 1
          }
        }
      },
      Booking: {
        type: 'object',
        description: 'Confirmed booking summary returned by GET /bookings/me.',
        required: [
          'id',
          'created_at',
          'updated_at',
          'cancelled_at',
          'status',
          'movie_id',
          'movie_title',
          'showtime_id',
          'starts_at',
          'auditorium',
          'seat_code'
        ],
        properties: {
          id: { type: 'integer', example: 1 },
          created_at: { type: 'string', format: 'date-time', example: '2026-08-01T10:00:00.000Z' },
          updated_at: { type: 'string', format: 'date-time', example: '2026-08-01T10:00:00.000Z' },
          cancelled_at: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            example: null
          },
          status: { $ref: '#/components/schemas/BookingStatus' },
          movie_id: { type: 'integer', example: 1 },
          movie_title: { type: 'string', example: 'The Matrix' },
          showtime_id: { type: 'integer', example: 1 },
          starts_at: { type: 'string', format: 'date-time', example: '2026-08-01T10:00:00.000Z' },
          auditorium: { type: 'string', example: 'A관' },
          seat_code: { type: 'string', example: 'A1' }
        }
      },
      BookingStatus: {
        type: 'string',
        description: 'Current booking lifecycle status. Public booking list responses include only CONFIRMED items.',
        enum: ['CONFIRMED', 'CANCELLED'],
        example: 'CONFIRMED'
      },
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' }
            }
          }
        }
      }
    }
  }
};
