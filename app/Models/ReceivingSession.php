<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReceivingSession extends Model
{
    protected $fillable = ['session_number', 'reference_number', 'supplier_name', 'store_code', 'notes', 'status', 'created_by'];

    public function items(): HasMany
    {
        return $this->hasMany(ReceivingItem::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopeAccessibleTo(Builder $query, User $user): Builder
    {
        return $user->role === 'operator' ? $query->where('created_by', $user->id) : $query;
    }
}
