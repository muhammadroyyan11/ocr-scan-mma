<?php

namespace App\Exceptions;

use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Throwable;

class Handler extends ExceptionHandler
{
    public function render($request, Throwable $exception)
    {
        if ($request->is('api/*')) {
            $request->headers->set('Accept', 'application/json');
            $response = parent::render($request, $exception);
            $body = $response->getData(true);

            return response()->json(['data' => null, 'message' => $body['message'] ?? 'Permintaan tidak dapat diproses.', 'errors' => $body['errors'] ?? (object) []], $response->getStatusCode(), $response->headers->all());
        }

        return parent::render($request, $exception);
    }

    /**
     * The list of the inputs that are never flashed to the session on validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     */
    public function register(): void
    {
        $this->reportable(function (Throwable $e) {
            //
        });
    }
}
