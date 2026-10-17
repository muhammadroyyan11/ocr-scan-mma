<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    public function index()
    {
        return view('users.index', ['users' => User::orderBy('name')->paginate(20)]);
    }

    private function rules(?User $user = null): array
    {
        return ['name' => 'required|string|max:255', 'email' => ['required', 'email', 'max:255', Rule::unique('users')->ignore($user?->id)], 'role' => 'required|in:admin,supervisor,operator,viewer', 'is_active' => 'required|boolean', 'password' => [$user ? 'nullable' : 'required', 'string', 'max:255', Password::min(12)->letters()->numbers()]];
    }

    public function store(Request $request)
    {
        $user = User::create($request->validate($this->rules()));

        return response()->json(['data' => $user, 'message' => 'Pengguna dibuat.'], 201);
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate($this->rules($user));
        if (empty($data['password'])) {
            unset($data['password']);
        }
        DB::transaction(function () use ($request, $user, $data) {
            $admins = User::where('role', 'admin')->where('is_active', true)->lockForUpdate()->get();
            if ($user->id === $request->user()->id && (! $data['is_active'] || $data['role'] !== 'admin')) {
                throw ValidationException::withMessages(['role' => 'Tidak dapat menonaktifkan atau menurunkan role akun sendiri.']);
            }
            if ($admins->contains('id', $user->id) && $admins->count() === 1 && (! $data['is_active'] || $data['role'] !== 'admin')) {
                throw ValidationException::withMessages(['role' => 'Minimal satu administrator aktif harus tersedia.']);
            }
            $user->update($data);
        });

        return response()->json(['data' => $user->fresh(), 'message' => 'Pengguna diperbarui.']);
    }
}
