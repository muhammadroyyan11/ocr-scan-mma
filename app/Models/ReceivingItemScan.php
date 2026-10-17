<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceivingItemScan extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['field_type', 'raw_text', 'normalized_text', 'confidence', 'crop_metadata'];

    protected $casts = ['crop_metadata' => 'array', 'confidence' => 'float'];

    public function item(): BelongsTo
    {
        return $this->belongsTo(ReceivingItem::class, 'receiving_item_id');
    }
}
