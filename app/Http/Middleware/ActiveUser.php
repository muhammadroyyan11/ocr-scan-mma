<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ActiveUser
{
    public function handle(Request $request, Closure $next)
    {
        if ($request->user() && ! $request->user()->is_active) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            abort(403, 'Akun dinonaktifkan. Hubungi administrator.');
        }

        return $next($request);
    }
}
