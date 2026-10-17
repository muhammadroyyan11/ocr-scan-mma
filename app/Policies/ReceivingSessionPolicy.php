<?php

namespace App\Policies;

use App\Models\ReceivingSession;
use App\Models\User;

class ReceivingSessionPolicy
{
    public function view(User $user, ReceivingSession $session): bool
    {
        return $user->role !== 'operator' || $session->created_by === $user->id;
    }

    public function create(User $user): bool
    {
        return $user->canWrite();
    }

    public function update(User $user, ReceivingSession $session): bool
    {
        return $user->canWrite() && $this->view($user, $session) && $session->status === 'open';
    }

    public function changeStatus(User $user, ReceivingSession $session): bool
    {
        return $user->canManage();
    }
}
