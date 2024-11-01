import numpy as np
from PIL import Image
import tensorflow as tf
from tensorflow.keras.models import load_model, Model
from tensorflow.keras.layers import Input
import pandas as pd
import matplotlib.pyplot as plt
import cv2

def preprocess_image(img_array):
    """
    Standardized preprocessing function that matches training preprocessing
    """
    print("Preprocessing steps:")
    print("1. Input array shape:", img_array.shape)
    
    # Ensure consistent size (32x32)
    processed = cv2.resize(img_array, (32, 32))
    print("2. After resize shape:", processed.shape)
    
    # Normalize to [0,1] range
    processed = processed.astype('float32') / 255.0
    print("3. After normalization min/max values:", np.min(processed), np.max(processed))
    
    # Reshape for model input (add batch and channel dimensions)
    processed = processed.reshape(1, 32, 32, 1)
    print("4. Final shape:", processed.shape)
    
    return processed

def test_image(img_path, model, class_mapping):
    """
    Test a single image with detailed diagnostics
    """
    try:
        # Load and preprocess image
        test_img = Image.open(img_path).convert('L')
        img_array = np.array(test_img)
        processed_img = preprocess_image(img_array)
        
        # Make prediction
        raw_prediction = model.predict(processed_img, verbose=0)
        
        # Get prediction details
        predicted_class = np.argmax(raw_prediction[0])
        confidence = raw_prediction[0][predicted_class]
        predicted_symbol = class_mapping.get(predicted_class, "Unknown")
        
        print("\nPrediction Details:")
        print(f"Predicted class: {predicted_class}")
        print(f"Predicted symbol: {predicted_symbol}")
        print(f"Confidence: {confidence:.4f}")
        
        # Print distribution statistics
        print("\nPrediction Distribution Stats:")
        print(f"Mean: {np.mean(raw_prediction):.6f}")
        print(f"Std: {np.std(raw_prediction):.6f}")
        print(f"Min: {np.min(raw_prediction):.6f}")
        print(f"Max: {np.max(raw_prediction):.6f}")
        
        # Show top 5 predictions
        top_5_indices = np.argsort(raw_prediction[0])[-5:][::-1]
        print("\nTop 5 predictions:")
        for idx in top_5_indices:
            symbol = class_mapping.get(idx, "Unknown")
            score = raw_prediction[0][idx]
            print(f"{symbol}: {score:.4f}")
        
        return {
            'class': predicted_class,
            'symbol': predicted_symbol,
            'confidence': confidence,
            'raw_prediction': raw_prediction[0]
        }
        
    except Exception as e:
        print(f"Error processing {img_path}: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def main():
    # Load the model with explicit input shape
    print("Loading model...")
    input_shape = (32, 32, 1)
    inputs = Input(shape=input_shape)
    
    # Load the base model
    base_model = load_model('./model/cnn_hasy_model.h5', compile=False)
    
    # Create a new model with explicit input
    model = Model(inputs=inputs, outputs=base_model(inputs))
    
    # Compile the model
    model.compile(
        optimizer='adam',
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    
    # Print model architecture
    model.summary()
    
    # Load symbol mapping
    symbols_df = pd.read_csv('./symbols.csv')
    class_mapping = dict(zip(range(len(symbols_df)), symbols_df['latex']))
    
    # Test multiple different images
    test_images = ['v2-23107.png', 'v2-57175.png']
    
    results = []
    for img_path in test_images:
        print(f"\n{'='*50}")
        print(f"Testing image: {img_path}")
        result = test_image(img_path, model, class_mapping)
        if result is not None:
            results.append({
                'image': img_path,
                'result': result
            })
    
    # Compare results
    if len(results) > 1:
        print("\nResults Comparison:")
        predictions = [r['result']['class'] for r in results]
        if len(set(predictions)) == 1:
            print("WARNING: All images predicted as same class!")
            print("Detailed analysis:")
            for r in results:
                print(f"\nImage: {r['image']}")
                print(f"Predicted symbol: {r['result']['symbol']}")
                print(f"Confidence: {r['result']['confidence']:.4f}")
                
            # Check if predictions are truly frozen
            raw_predictions = [r['result']['raw_prediction'] for r in results]
            if all(np.array_equal(raw_predictions[0], pred) for pred in raw_predictions[1:]):
                print("\nCRITICAL: Raw predictions are identical across all images!")
                print("This indicates the model weights might be corrupted or frozen.")

if __name__ == "__main__":
    main()
