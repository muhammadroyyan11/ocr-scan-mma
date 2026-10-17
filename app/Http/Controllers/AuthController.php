<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate(['email' => 'required|email|max:255', 'password' => 'required|string|max:255']);
        if (! Auth::attempt([...$credentials, 'is_active' => true], false)) {
            throw ValidationException::withMessages(['email' => 'Email atau password salah, atau akun tidak aktif.']);
        }
        $request->session()->regenerate();

        return redirect()->intended('/');
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/login');
    }

    public function password(Request $request)
    {
        $data = $request->validate(['current_password' => 'required|current_password', 'password' => ['required', 'confirmed', Password::min(12)->letters()->numbers(), 'max:255']]);
        $request->user()->update(['password' => Hash::make($data['password'])]);
        $request->session()->regenerate();

        return back()->with('success', 'Password berhasil diganti.');
    }
}
