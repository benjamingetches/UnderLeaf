import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model, Model
from tensorflow.keras.layers import Input
import matplotlib.pyplot as plt
import cv2
from PIL import Image

def generate_test_inputs():
    """Generate different test inputs to check model response"""
    # All black image
    black = np.zeros((32, 32, 1))
    
    # All white image
    white = np.ones((32, 32, 1))
    
    # Random noise
    noise = np.random.rand(32, 32, 1)
    
    # Gradient pattern
    gradient = np.linspace(0, 1, 32)
    gradient = np.tile(gradient, (32, 1))
    gradient = gradient.reshape(32, 32, 1)
    
    return {
        'black': black,
        'white': white,
        'noise': noise,
        'gradient': gradient
    }

def test_model_response():
    print("Loading model...")
    try:
        # Load model with explicit input shape
        input_shape = (32, 32, 1)
        inputs = Input(shape=input_shape)
        base_model = load_model('./model/cnn_hasy_model.h5', compile=False)
        model = Model(inputs=inputs, outputs=base_model(inputs))
        
        # Generate test inputs
        test_inputs = generate_test_inputs()
        
        # Store results for each test input
        results = {}
        
        print("\nTesting model response to different inputs...")
        for input_name, test_input in test_inputs.items():
            # Prepare input
            processed_input = test_input.reshape(1, 32, 32, 1)
            
            # Get predictions
            predictions = model.predict(processed_input, verbose=0)
            
            # Store results
            results[input_name] = {
                'predictions': predictions[0],
                'max_class': np.argmax(predictions[0]),
                'max_confidence': np.max(predictions[0]),
                'mean': np.mean(predictions[0]),
                'std': np.std(predictions[0])
            }
        
        # Analyze results
        print("\nAnalysis Results:")
        print("=" * 50)
        
        # Check if predictions are identical
        predictions_list = [r['predictions'] for r in results.values()]
        identical_predictions = all(np.array_equal(predictions_list[0], pred) 
                                 for pred in predictions_list[1:])
        
        if identical_predictions:
            print("CRITICAL: Model produces identical predictions for all inputs!")
            print("This indicates the model is frozen or corrupted.")
        else:
            print("Model produces different predictions for different inputs.")
        
        # Print detailed results
        print("\nDetailed Results:")
        print("=" * 50)
        for input_name, result in results.items():
            print(f"\nInput: {input_name}")
            print(f"Predicted Class: {result['max_class']}")
            print(f"Confidence: {result['max_confidence']:.4f}")
            print(f"Prediction Mean: {result['mean']:.4f}")
            print(f"Prediction Std: {result['std']:.4f}")
        
        # Visualize prediction distributions
        plt.figure(figsize=(15, 5))
        for i, (input_name, result) in enumerate(results.items()):
            plt.subplot(1, len(results), i+1)
            plt.hist(result['predictions'], bins=50)
            plt.title(f'{input_name} predictions')
            plt.xlabel('Prediction value')
            plt.ylabel('Frequency')
        plt.tight_layout()
        plt.show()
        
        # Test intermediate layer activations
        print("\nTesting intermediate layer activations...")
        print("=" * 50)
        
        # Get intermediate layer outputs
        for i, layer in enumerate(model.layers[:-1]):  # Exclude output layer
            intermediate_model = Model(inputs=model.input, outputs=layer.output)
            layer_output = intermediate_model.predict(test_inputs['noise'].reshape(1, 32, 32, 1))
            
            print(f"\nLayer {i}: {layer.name}")
            print(f"Output shape: {layer_output.shape}")
            print(f"Mean activation: {np.mean(layer_output):.4f}")
            print(f"Std activation: {np.std(layer_output):.4f}")
            print(f"Min activation: {np.min(layer_output):.4f}")
            print(f"Max activation: {np.max(layer_output):.4f}")
            print(f"Unique values: {len(np.unique(layer_output))}")
        
    except Exception as e:
        print(f"Error during testing: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_model_response()