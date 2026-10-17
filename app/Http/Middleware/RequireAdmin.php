<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class RequireAdmin
{
    public function handle(Request $request, Closure $next)
    {
        abort_unless($request->user()?->role === 'admin', 403, 'Hanya administrator yang dapat mengelola pengguna.');

        return $next($request);
    }
}
